// Compares two screenshots pixel by pixel: how many pixels differ by more
// than a threshold, by how much at most, and on average. Writes a third
// image with every differing pixel in red over a dimmed copy of the first.
// Used by capture.ps1 -Compare; nothing outside the .NET Framework.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ImageDiff
{
    static byte[] Pixels(Bitmap image, out int stride)
    {
        var data = image.LockBits(new Rectangle(0, 0, image.Width, image.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        stride = data.Stride;
        var bytes = new byte[stride * image.Height];
        Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
        image.UnlockBits(data);
        return bytes;
    }

    public static Dictionary<string, object> Compare(string a, string b, string diffOut, int threshold)
    {
        var result = new Dictionary<string, object>();
        using (var first = new Bitmap(a))
        using (var second = new Bitmap(b))
        {
            result["sizeA"] = first.Width + "x" + first.Height;
            result["sizeB"] = second.Width + "x" + second.Height;
            if (first.Width != second.Width || first.Height != second.Height) { result["sameSize"] = false; return result; }
            result["sameSize"] = true;
            int strideA, strideB;
            var pa = Pixels(first, out strideA);
            var pb = Pixels(second, out strideB);
            int w = first.Width, h = first.Height;
            long differing = 0, total = (long)w * h; int max = 0; double sum = 0;
            int x0 = w, y0 = h, x1 = -1, y1 = -1;
            var outBytes = new byte[pa.Length];
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    int i = y * strideA + x * 4, j = y * strideB + x * 4;
                    int d = Math.Max(Math.Abs(pa[i] - pb[j]), Math.Max(Math.Abs(pa[i + 1] - pb[j + 1]), Math.Abs(pa[i + 2] - pb[j + 2])));
                    sum += d;
                    if (d > max) max = d;
                    bool off = d > threshold;
                    if (off) { differing++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
                    outBytes[i] = off ? (byte)0 : (byte)(pa[i] / 3);
                    outBytes[i + 1] = off ? (byte)0 : (byte)(pa[i + 1] / 3);
                    outBytes[i + 2] = off ? (byte)255 : (byte)(pa[i + 2] / 3);
                    outBytes[i + 3] = 255;
                }
            }
            result["differingPct"] = 100.0 * differing / total;
            result["maxChannelDiff"] = max;
            result["meanChannelDiff"] = sum / total;
            result["diffBox"] = x1 < 0 ? "none" : string.Format("{0},{1} {2}x{3}", x0, y0, x1 - x0 + 1, y1 - y0 + 1);
            if (!string.IsNullOrEmpty(diffOut))
            {
                using (var diff = new Bitmap(w, h, PixelFormat.Format32bppArgb))
                {
                    var data = diff.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                    Marshal.Copy(outBytes, 0, data.Scan0, Math.Min(outBytes.Length, data.Stride * h));
                    diff.UnlockBits(data);
                    diff.Save(diffOut, ImageFormat.Png);
                }
            }
        }
        return result;
    }
}
