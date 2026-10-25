// Reads a Chrome trace (JSON, as DevTools writes it) and works out what a run
// cost: how evenly frames reached the screen, how busy each thread was, and
// where the page's own main thread spent its time. Loaded by bench.ps1 with
// Add-Type; nothing outside the .NET Framework that ships with Windows.
//
// Frames are the GPU process swapping a finished picture to the screen
// (viz's Display::DrawAndSwap). An interval of 16.7ms is one display frame at
// 60Hz; anything at 1.5 display frames or more missed at least one vsync.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

public static class TraceStats
{
    // ---- A small streaming JSON reader: one event object at a time. -------
    sealed class Reader
    {
        readonly string s; int i;
        public Reader(string text) { s = text; i = 0; }
        void Ws() { while (i < s.Length && s[i] <= ' ') i++; }
        public bool SeekArray(string key)
        {
            int at = s.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (at < 0) return false;
            i = s.IndexOf('[', at);
            if (i < 0) return false;
            i++;
            return true;
        }
        // Next element of the array we are in, or null at its end.
        public object NextElement()
        {
            Ws();
            if (i >= s.Length || s[i] == ']') return null;
            if (s[i] == ',') { i++; Ws(); }
            if (s[i] == ']') return null;
            return Value();
        }
        object Value()
        {
            Ws();
            char c = s[i];
            if (c == '{') return Obj();
            if (c == '[') return Arr();
            if (c == '"') return Str();
            if (c == 't') { i += 4; return true; }
            if (c == 'f') { i += 5; return false; }
            if (c == 'n') { i += 4; return null; }
            return Num();
        }
        Dictionary<string, object> Obj()
        {
            var d = new Dictionary<string, object>();
            i++;
            while (true)
            {
                Ws();
                if (s[i] == '}') { i++; return d; }
                if (s[i] == ',') { i++; continue; }
                string k = Str();
                Ws(); i++; // :
                d[k] = Value();
            }
        }
        List<object> Arr()
        {
            var a = new List<object>();
            i++;
            while (true)
            {
                Ws();
                if (s[i] == ']') { i++; return a; }
                if (s[i] == ',') { i++; continue; }
                a.Add(Value());
            }
        }
        string Str()
        {
            i++;
            int start = i;
            StringBuilder sb = null;
            while (true)
            {
                char c = s[i];
                if (c == '"') { string r = sb == null ? s.Substring(start, i - start) : sb.Append(s, start, i - start).ToString(); i++; return r; }
                if (c == '\\')
                {
                    if (sb == null) sb = new StringBuilder();
                    sb.Append(s, start, i - start);
                    char e = s[i + 1];
                    if (e == 'u') { sb.Append((char)Convert.ToInt32(s.Substring(i + 2, 4), 16)); i += 6; }
                    else { sb.Append(e == 'n' ? '\n' : e == 't' ? '\t' : e == 'r' ? '\r' : e == 'b' ? '\b' : e == 'f' ? '\f' : e); i += 2; }
                    start = i;
                    continue;
                }
                i++;
            }
        }
        double Num()
        {
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            return double.Parse(s.Substring(start, i - start), CultureInfo.InvariantCulture);
        }
    }

    static double D(Dictionary<string, object> e, string k) { object v; return e.TryGetValue(k, out v) && v is double ? (double)v : double.NaN; }
    static string S(Dictionary<string, object> e, string k) { object v; return e.TryGetValue(k, out v) ? v as string : null; }
    static Dictionary<string, object> O(Dictionary<string, object> e, string k) { object v; return e.TryGetValue(k, out v) ? v as Dictionary<string, object> : null; }

    struct Slice { public double Ts, Dur, Tdur; public int Pid, Tid; public string Name; }

    static double Pct(List<double> sorted, double p)
    {
        if (sorted.Count == 0) return double.NaN;
        int k = (int)Math.Ceiling(p * sorted.Count) - 1;
        return sorted[Math.Max(0, Math.Min(sorted.Count - 1, k))];
    }

    // Busy time of a thread inside [from, to]: the union of its top-level
    // tasks, clipped to the window.
    static double Busy(List<Slice> slices, double from, double to)
    {
        double total = 0, reach = double.MinValue;
        foreach (var t in slices.OrderBy(x => x.Ts))
        {
            double a = Math.Max(t.Ts, from), b = Math.Min(t.Ts + t.Dur, to);
            if (b <= a) continue;
            if (a < reach) a = reach;
            if (b > a) { total += b - a; reach = b; }
        }
        return total;
    }

    // Everything recorded on threads whose name starts with `threadPrefix`
    // in processes whose name contains `processPart`, totalled by event name
    // (inclusive) and, for tasks, by where they were posted from. For finding
    // out what a busy thread is doing.
    public static List<KeyValuePair<string, double>> Breakdown(string path, string processPart, string threadPrefix, string startMark, string endMark, int top)
    {
        return Breakdown(path, processPart, threadPrefix, startMark, endMark, top, double.NaN, double.NaN);
    }

    // The same, inside [fromMs, toMs] after the start mark.
    public static List<KeyValuePair<string, double>> Breakdown(string path, string processPart, string threadPrefix, string startMark, string endMark, int top, double fromMs, double toMs)
    {
        var text = File.ReadAllText(path);
        var reader = new Reader(text);
        if (!reader.SeekArray("traceEvents")) throw new Exception("no traceEvents");
        var threadNames = new Dictionary<long, string>();
        var processNames = new Dictionary<int, string>();
        var slices = new List<KeyValuePair<long, Slice>>();
        double from = double.MinValue, to = double.MaxValue;
        object element;
        while ((element = reader.NextElement()) != null)
        {
            var e = element as Dictionary<string, object>;
            if (e == null) continue;
            string ph = S(e, "ph"), name = S(e, "name");
            int pid = (int)D(e, "pid"); int tid = double.IsNaN(D(e, "tid")) ? 0 : (int)D(e, "tid");
            long key = ((long)pid << 32) | (uint)tid;
            if (ph == "M")
            {
                var a = O(e, "args");
                if (a == null) continue;
                if (name == "thread_name") threadNames[key] = S(a, "name");
                if (name == "process_name") processNames[pid] = S(a, "name");
                continue;
            }
            if (name == startMark) { from = D(e, "ts"); continue; }
            if (name == endMark) { to = D(e, "ts"); continue; }
            if (ph != "X") continue;
            string label = name;
            var args = O(e, "args");
            if (args != null)
            {
                var posted = O(args, "task") ?? args;
                var from2 = O(posted, "posted_from");
                string fn = from2 != null ? (S(from2, "function_name") ?? S(from2, "file_name")) : (S(args, "src_func") ?? null);
                if (fn != null) label = name + " <- " + fn;
            }
            var sl = new Slice { Ts = D(e, "ts"), Dur = double.IsNaN(D(e, "dur")) ? 0 : D(e, "dur"), Pid = pid, Tid = tid, Name = label };
            slices.Add(new KeyValuePair<long, Slice>(key, sl));
        }
        var totals = new Dictionary<string, double>();
        if (!double.IsNaN(fromMs)) { double origin = from; from = origin + fromMs * 1000.0; to = origin + toMs * 1000.0; }
        double span = Math.Max(1, to - from);
        foreach (var kv in slices)
        {
            var sl = kv.Value;
            if (sl.Ts < from || sl.Ts > to) continue;
            string tn; if (!threadNames.TryGetValue(kv.Key, out tn) || tn == null || !tn.StartsWith(threadPrefix)) continue;
            string pn; if (!processNames.TryGetValue(sl.Pid, out pn) || pn == null || pn.IndexOf(processPart, StringComparison.OrdinalIgnoreCase) < 0) continue;
            double prev; totals.TryGetValue(sl.Name, out prev); totals[sl.Name] = prev + sl.Dur / 1000.0 / (span / 1e6);
        }
        return totals.OrderByDescending(x => x.Value).Take(top).ToList();
    }

    // How many render passes each frame the display compositor drew had in
    // it, as a histogram (passes -> frames), with the time each frame took.
    // A frame of only the root pass reused every sheet of glass; one with a
    // pass per sheet re-filtered them all.
    public static Dictionary<string, object> PassesPerFrame(string path)
    {
        var text = File.ReadAllText(path);
        var reader = new Reader(text);
        if (!reader.SeekArray("traceEvents")) throw new Exception("no traceEvents");
        var frames = new List<Slice>(); var passes = new List<Slice>();
        object element;
        while ((element = reader.NextElement()) != null)
        {
            var e = element as Dictionary<string, object>;
            if (e == null || S(e, "ph") != "X") continue;
            string name = S(e, "name");
            if (name != "DirectRenderer::DrawFrame" && name != "DirectRenderer::DrawRenderPass") continue;
            var sl = new Slice { Ts = D(e, "ts"), Dur = D(e, "dur"), Pid = (int)D(e, "pid"), Tid = (int)D(e, "tid"), Name = name };
            (name == "DirectRenderer::DrawFrame" ? frames : passes).Add(sl);
        }
        var histogram = new SortedDictionary<int, int>();
        var timeByCount = new SortedDictionary<int, double>();
        passes.Sort((a, b) => a.Ts.CompareTo(b.Ts));
        foreach (var f in frames)
        {
            int n = passes.Count(p => p.Tid == f.Tid && p.Ts >= f.Ts && p.Ts <= f.Ts + f.Dur);
            int c; histogram.TryGetValue(n, out c); histogram[n] = c + 1;
            double t; timeByCount.TryGetValue(n, out t); timeByCount[n] = t + f.Dur / 1000.0;
        }
        var result = new Dictionary<string, object>();
        foreach (var kv in histogram) result["passes_" + kv.Key] = kv.Value + " frames, avg " + (timeByCount[kv.Key] / kv.Value).ToString("0.00") + " ms";
        return result;
    }

    // Every frame the display compositor drew, as "milliseconds after the
    // mark | the screen area it redrew" -- for lining frames up against what
    // the page itself says it changed in them.
    public static List<string> DamageTimeline(string path, string mark)
    {
        var text = File.ReadAllText(path);
        var reader = new Reader(text);
        if (!reader.SeekArray("traceEvents")) throw new Exception("no traceEvents");
        double origin = double.NaN;
        var frames = new List<KeyValuePair<double, string>>();
        object element;
        while ((element = reader.NextElement()) != null)
        {
            var e = element as Dictionary<string, object>;
            if (e == null) continue;
            string name = S(e, "name");
            if (name == mark && double.IsNaN(origin)) origin = D(e, "ts");
            if (name != "DirectRenderer::DrawFrame ProcessForOverlays") continue;
            var args = O(e, "args");
            string damage = args == null ? "?" : (S(args, "root_damage_rect") ?? "?");
            frames.Add(new KeyValuePair<double, string>(D(e, "ts"), damage));
        }
        return frames.OrderBy(f => f.Key).Select(f => ((f.Key - origin) / 1000.0).ToString("0.0", CultureInfo.InvariantCulture) + "|" + f.Value).ToList();
    }

    // The run in slices of `binMs`: frames the page presented and dropped,
    // and how busy the page's main thread and the GPU process's main thread
    // were, each slice. For seeing where in an interaction the frames go.
    public static List<string> Timeline(string path, string startMark, string endMark, double binMs)
    {
        var text = File.ReadAllText(path);
        var reader = new Reader(text);
        if (!reader.SeekArray("traceEvents")) throw new Exception("no traceEvents");
        var threadNames = new Dictionary<long, string>();
        var processNames = new Dictionary<int, string>();
        var tasks = new List<Slice>();
        var frames = new List<KeyValuePair<double, string>>();
        var userMarks = new List<KeyValuePair<double, string>>();
        var mainFrames = new List<Slice>();
        double from = double.NaN, to = double.NaN; int markPid = -1;
        object element;
        while ((element = reader.NextElement()) != null)
        {
            var e = element as Dictionary<string, object>;
            if (e == null) continue;
            string ph = S(e, "ph"), name = S(e, "name");
            int pid = (int)D(e, "pid"); int tid = double.IsNaN(D(e, "tid")) ? 0 : (int)D(e, "tid");
            long key = ((long)pid << 32) | (uint)tid;
            if (ph == "M")
            {
                var a = O(e, "args");
                if (a != null && name == "thread_name") threadNames[key] = S(a, "name");
                if (a != null && name == "process_name") processNames[pid] = S(a, "name");
                continue;
            }
            double ts = D(e, "ts");
            if (name == startMark) { from = ts; continue; }
            if (name == endMark) { to = ts; markPid = pid; continue; }
            if (name != null && name.StartsWith("bench:")) { userMarks.Add(new KeyValuePair<double, string>(ts, name)); continue; }
            if (ph == "X" && name == "ThreadControllerImpl::RunTask") { tasks.Add(new Slice { Ts = ts, Dur = D(e, "dur"), Pid = pid, Tid = tid }); continue; }
            if (ph == "X" && name == "ProxyMain::BeginMainFrame") { mainFrames.Add(new Slice { Ts = ts, Dur = D(e, "dur"), Pid = pid, Tid = tid }); continue; }
            if (name == "PipelineReporter" && ph == "b")
            {
                var args = O(e, "args");
                var r = args == null ? null : (O(args, "frame_reporter") ?? O(args, "chrome_frame_reporter"));
                if (r != null) frames.Add(new KeyValuePair<double, string>(ts, pid + "|" + S(r, "state")));
            }
        }
        var lines = new List<string>();
        int bins = (int)Math.Ceiling((to - from) / 1000.0 / binMs);
        var presented = new int[bins]; var dropped = new int[bins]; var main = new double[bins]; var gpu = new double[bins];
        foreach (var f in frames)
        {
            var p = f.Value.Split('|');
            if (p[0] != markPid.ToString()) continue;
            int b = (int)((f.Key - from) / 1000.0 / binMs);
            if (b < 0 || b >= bins) continue;
            if (p[1] == "STATE_DROPPED") dropped[b]++; else if (p[1].StartsWith("STATE_PRESENTED")) presented[b]++;
        }
        foreach (var t in tasks)
        {
            string tn; threadNames.TryGetValue(((long)t.Pid << 32) | (uint)t.Tid, out tn);
            string pn; processNames.TryGetValue(t.Pid, out pn);
            bool isMain = t.Pid == markPid && tn == "CrRendererMain";
            bool isGpu = pn == "GPU Process" && tn == "CrGpuMain";
            if (!isMain && !isGpu) continue;
            // Spread each task over the slices it covers.
            double a = t.Ts, z = t.Ts + t.Dur;
            for (double c = a; c < z;)
            {
                int b = (int)((c - from) / 1000.0 / binMs);
                double binEnd = from + (b + 1) * binMs * 1000.0;
                double piece = Math.Min(z, binEnd) - c;
                if (b >= 0 && b < bins) { if (isMain) main[b] += piece / 1000.0; else gpu[b] += piece / 1000.0; }
                c += Math.Max(piece, 1);
            }
        }
        var beginMain = new int[bins];
        foreach (var m in mainFrames)
        {
            if (m.Pid != markPid) continue;
            int b = (int)((m.Ts - from) / 1000.0 / binMs);
            if (b >= 0 && b < bins) beginMain[b]++;
        }
        for (int b = 0; b < bins; b++)
        {
            double t0 = b * binMs;
            string marksHere = string.Join(" ", userMarks.Where(m => (m.Key - from) / 1000.0 >= t0 && (m.Key - from) / 1000.0 < t0 + binMs).Select(m => m.Value.Substring(6)));
            lines.Add(string.Format(CultureInfo.InvariantCulture, "{0,7:0} ms  {1}{2}  mainframes {3}  main {4,5:0.0}  gpu {5,5:0.0}  {6}",
                t0, new string('#', presented[b]), new string('x', dropped[b]).PadRight(Math.Max(0, 6 - presented[b])), new string('m', beginMain[b]).PadRight(4), main[b], gpu[b], marksHere));
        }
        return lines;
    }

    public static Dictionary<string, object> Analyze(string path, string startMark, string endMark)
    {
        var text = File.ReadAllText(path);
        var reader = new Reader(text);
        if (!reader.SeekArray("traceEvents")) throw new Exception("no traceEvents in " + path);

        var threadNames = new Dictionary<long, string>();
        var processNames = new Dictionary<int, string>();
        var swaps = new List<Slice>();
        var tasks = new List<Slice>();
        var timeline = new List<Slice>();
        var marks = new Dictionary<string, double>();
        // The page's own renderer is the one that wrote the marks.
        int markPid = -1;
        var pipeline = new Dictionary<string, int>();
        var gcs = new List<Slice>();
        // What the GPU process's main thread spends its time on (needs the
        // "gpu" and "viz" categories): compositing the screen, replaying the
        // page's canvas, rasterising the page's tiles, swapping.
        var gpuWork = new Dictionary<string, string> {
            { "SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass", "composite" },
            { "RendererMainThread", "canvas" },
            { "RendererRasterWorker", "tiles" },
            { "SkiaOutputSurfaceImplOnGpu::SwapBuffers", "swap" },
            { "CommandBufferStub::OnAsyncFlush", "commandBuffers" }
        };
        var gpuSlices = new List<Slice>();
        // The page's own frames: how often its main thread got to run one
        // (rAF, style, paint, commit). The sky only moves in these.
        var beginMainFrames = new List<Slice>();
        double first = double.MaxValue, last = double.MinValue;

        object element;
        while ((element = reader.NextElement()) != null)
        {
            var e = element as Dictionary<string, object>;
            if (e == null) continue;
            string ph = S(e, "ph"), name = S(e, "name"), cat = S(e, "cat") ?? "";
            int pid = (int)D(e, "pid"); int tid = double.IsNaN(D(e, "tid")) ? 0 : (int)D(e, "tid");
            double ts = D(e, "ts");
            if (ph == "M")
            {
                var args = O(e, "args");
                if (args == null) continue;
                if (name == "thread_name") threadNames[((long)pid << 32) | (uint)tid] = S(args, "name");
                if (name == "process_name") processNames[pid] = S(args, "name");
                continue;
            }
            if (double.IsNaN(ts)) continue;
            if (ts < first) first = ts;
            if (ts > last) last = ts;
            double dur = D(e, "dur"); if (double.IsNaN(dur)) dur = 0;
            double tdur = D(e, "tdur"); if (double.IsNaN(tdur)) tdur = dur;
            var slice = new Slice { Ts = ts, Dur = dur, Tdur = tdur, Pid = pid, Tid = tid, Name = name };
            if (name == startMark || name == endMark) { if (!marks.ContainsKey(name)) marks[name] = ts; if (name == endMark) markPid = pid; continue; }
            if (name == "Display::DrawAndSwap" && (ph == "X" || ph == "B")) { swaps.Add(slice); continue; }
            if (ph == "X" && (name == "ThreadControllerImpl::RunTask" || name == "ThreadPool_RunTask")) { tasks.Add(slice); continue; }
            if (name == "PipelineReporter" && (ph == "b" || ph == "B"))
            {
                // Chrome's own account of every frame it meant to produce:
                // presented, dropped, or nothing to update. Kept per process,
                // so the page's frames can be told from the browser's own UI.
                var args = O(e, "args");
                var reporter = args == null ? null : (O(args, "frame_reporter") ?? O(args, "chrome_frame_reporter"));
                if (reporter == null) continue;
                string state = S(reporter, "state") ?? "?";
                string key = pid + "|" + state;
                if (state == "STATE_DROPPED") key += "|" + (S(reporter, "reason") ?? "?");
                int n; pipeline.TryGetValue(key, out n); pipeline[key] = n + 1;
                object missing;
                if (reporter.TryGetValue("has_missing_content", out missing) && missing is bool && (bool)missing)
                {
                    pipeline.TryGetValue(pid + "|missing", out n); pipeline[pid + "|missing"] = n + 1;
                }
                continue;
            }
            if (ph == "X" && gpuWork.ContainsKey(name)) { slice.Name = gpuWork[name]; gpuSlices.Add(slice); continue; }
            if (ph == "X" && name == "ProxyMain::BeginMainFrame") { beginMainFrames.Add(slice); continue; }
            if (ph == "X" && (name == "MinorGC" || name == "MajorGC" || name == "V8.GC_SCAVENGER" || name == "V8.GCScavenger" || name == "V8.GCFinalizeMC")) { gcs.Add(slice); }
            if (ph == "X" && cat.Contains("devtools.timeline")) timeline.Add(slice);
        }
        text = null;

        double from = marks.ContainsKey(startMark) ? marks[startMark] : first;
        double to = marks.ContainsKey(endMark) ? marks[endMark] : last;
        double span = Math.Max(1, to - from);
        var result = new Dictionary<string, object>();
        result["windowMs"] = span / 1000.0;
        result["markedWindow"] = marks.ContainsKey(startMark) && marks.ContainsKey(endMark);

        Func<int, int, string> threadName = (p, t) => { string n; return threadNames.TryGetValue(((long)p << 32) | (uint)t, out n) ? n : "?"; };

        // The page's renderer: the one that wrote the end mark. Failing that,
        // the one whose main thread worked hardest -- which is not always the
        // page's: a YouTube player in a project sheet runs in a process of
        // its own and can outwork it.
        int renderer = markPid; double rendererBusy = -1;
        if (renderer < 0)
        {
            foreach (var g in tasks.Where(t => threadName(t.Pid, t.Tid) == "CrRendererMain").GroupBy(t => t.Pid))
            {
                double b = Busy(g.ToList(), from, to);
                if (b > rendererBusy) { rendererBusy = b; renderer = g.Key; }
            }
        }
        result["rendererPid"] = renderer;
        // Other renderers' main threads (an embedded player, say), together.
        result["otherRenderersBusyPct"] = 100.0 * tasks.Where(t => t.Pid != renderer && threadName(t.Pid, t.Tid) == "CrRendererMain")
            .GroupBy(t => t.Pid).Sum(g => Busy(g.ToList(), from, to)) / span;

        // Frames on screen.
        var swapTimes = swaps.Where(x => x.Ts >= from && x.Ts <= to).Select(x => x.Ts + x.Dur).OrderBy(x => x).ToList();
        var intervals = new List<double>();
        for (int k = 1; k < swapTimes.Count; k++) intervals.Add((swapTimes[k] - swapTimes[k - 1]) / 1000.0);
        intervals.Sort();
        result["frames"] = swapTimes.Count;
        result["fps"] = swapTimes.Count / (span / 1e6);
        result["frameMedianMs"] = Pct(intervals, .5);
        result["frameP95Ms"] = Pct(intervals, .95);
        result["frameP99Ms"] = Pct(intervals, .99);
        result["frameMaxMs"] = intervals.Count > 0 ? intervals[intervals.Count - 1] : double.NaN;
        result["framesOver16_7Pct"] = intervals.Count == 0 ? double.NaN : 100.0 * intervals.Count(x => x > 16.7 * 1.5) / intervals.Count;
        result["framesOver33Pct"] = intervals.Count == 0 ? double.NaN : 100.0 * intervals.Count(x => x > 33.4 * 1.25) / intervals.Count;
        result["swapAvgMs"] = swaps.Count == 0 ? double.NaN : swaps.Where(x => x.Ts >= from && x.Ts <= to).Select(x => x.Dur / 1000.0).DefaultIfEmpty(double.NaN).Average();

        // The page's frames as Chrome itself scored them. A dropped frame is
        // one the page meant to show and did not get to the screen in time;
        // a frame with nothing to update is not counted against it.
        int presented = 0, dropped = 0, idle = 0, missingContent = 0;
        foreach (var kv in pipeline)
        {
            var parts = kv.Key.Split('|');
            if (parts[0] != renderer.ToString()) continue;
            if (parts[1] == "STATE_PRESENTED_ALL" || parts[1] == "STATE_PRESENTED_PARTIAL") presented += kv.Value;
            else if (parts[1] == "STATE_DROPPED") { dropped += kv.Value; result["droppedBy_" + (parts.Length > 2 ? parts[2] : "?")] = kv.Value; }
            else if (parts[1] == "STATE_NO_UPDATE_DESIRED") idle += kv.Value;
            else if (parts[1] == "missing") missingContent += kv.Value;
        }
        result["presentedFrames"] = presented;
        result["droppedFrames"] = dropped;
        result["droppedPct"] = presented + dropped == 0 ? double.NaN : 100.0 * dropped / (presented + dropped);
        result["noUpdateFrames"] = idle;
        result["missingContentFrames"] = missingContent;

        // Each thread's busy share of the window, by the names Chrome gives them.
        var busy = new Dictionary<string, double>();
        foreach (var g in tasks.GroupBy(t => new { t.Pid, t.Tid }))
        {
            string n = threadName(g.Key.Pid, g.Key.Tid);
            string p; processNames.TryGetValue(g.Key.Pid, out p);
            string label;
            if (g.Key.Pid == renderer) label = "renderer:" + n;
            else if (p == "GPU Process") label = "gpu:" + n;
            else if (p == "Browser") label = "browser:" + n;
            else continue;
            if (label.StartsWith("renderer:") && n.StartsWith("ThreadPool")) label = "renderer:ThreadPool";
            if (label.StartsWith("renderer:CompositorTileWorker")) label = "renderer:CompositorTileWorker";
            if (label.StartsWith("gpu:ThreadPool")) label = "gpu:ThreadPool";
            if (label.StartsWith("browser:")) label = "browser:" + (n.StartsWith("ThreadPool") ? "ThreadPool" : n);
            double b = Busy(g.ToList(), from, to);
            double prev; busy.TryGetValue(label, out prev); busy[label] = prev + b;
        }
        foreach (var kv in busy.OrderByDescending(x => x.Value)) result["busyPct_" + kv.Key] = 100.0 * kv.Value / span;

        // Long tasks on the page's main thread.
        var mainTasks = tasks.Where(t => t.Pid == renderer && threadName(t.Pid, t.Tid) == "CrRendererMain" && t.Ts >= from && t.Ts <= to).ToList();
        var longTasks = mainTasks.Where(t => t.Dur > 50000).Select(t => t.Dur / 1000.0).OrderByDescending(x => x).ToList();
        result["longTasks"] = longTasks.Count;
        result["longTaskMaxMs"] = longTasks.Count > 0 ? longTasks[0] : 0.0;
        result["longTaskTotalMs"] = longTasks.Sum();
        var taskDurations = mainTasks.Select(t => t.Dur / 1000.0).OrderBy(x => x).ToList();
        result["mainTaskP99Ms"] = Pct(taskDurations, .99);

        // Where the main thread's time went (inclusive, so nested phases overlap).
        var phases = new Dictionary<string, double>();
        foreach (var t in timeline.Where(t => t.Pid == renderer && threadName(t.Pid, t.Tid) == "CrRendererMain" && t.Ts >= from && t.Ts <= to))
        {
            double prev; phases.TryGetValue(t.Name, out prev); phases[t.Name] = prev + t.Dur;
        }
        foreach (var kv in phases.OrderByDescending(x => x.Value).Take(16)) result["mainMsPerSec_" + kv.Key] = kv.Value / 1000.0 / (span / 1e6);
        result["gcMs"] = gcs.Where(g => g.Pid == renderer && g.Ts >= from && g.Ts <= to).Sum(g => g.Dur) / 1000.0;
        foreach (var g in gpuSlices.Where(x => threadName(x.Pid, x.Tid) == "CrGpuMain" && x.Ts >= from && x.Ts <= to).GroupBy(x => x.Name))
            result["gpuMsPerSec_" + g.Key] = g.Sum(x => x.Dur) / 1000.0 / (span / 1e6);
        var pageFrames = beginMainFrames.Where(m => m.Pid == renderer && m.Ts >= from && m.Ts <= to).Select(m => m.Ts).OrderBy(x => x).ToList();
        result["mainFramesPerSec"] = pageFrames.Count / (span / 1e6);
        var mainGaps = new List<double>();
        for (int k = 1; k < pageFrames.Count; k++) mainGaps.Add((pageFrames[k] - pageFrames[k - 1]) / 1000.0);
        mainGaps.Sort();
        result["mainFrameGapP90Ms"] = Pct(mainGaps, .9);
        result["mainFrameGapMaxMs"] = mainGaps.Count > 0 ? mainGaps[mainGaps.Count - 1] : double.NaN;
        return result;
    }
}
