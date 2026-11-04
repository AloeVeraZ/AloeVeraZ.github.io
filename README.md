<div align="center">

# Angelo Demetroulakos
**Mechanical Engineering & Robotics Portfolio**

Robots, mechanisms, and things I built from scratch — presented through glass, oversized type, and a living night sky.

[**Explore the portfolio ↗**](https://aloeveraz.github.io/)

</div>

[![Portfolio homepage with oversized cream typography, glass controls, and an animated space backdrop](docs/images/portfolio-hero.webp)](https://aloeveraz.github.io/)

## The look

Near-black backgrounds. Warm white lettering. Ice-blue accents. Barlow Condensed headlines paired with Inter body text. Translucent glass cards and a floating navigation bar catch the light over stars, planets, and black holes.

The site feels like a window into space, with the engineering work in the foreground.

| Detail | What you'll see |
| --- | --- |
| **Glass & light** | Frosted surfaces, illuminated edges, and buttons that react to the cursor |
| **Motion & depth** | An interactive cosmic backdrop, tilting cards, and animated transitions |
| **Three effects levels** | Low, Medium, and High, selected from the navigation bar |
| **Hidden looks** | Double-press a slider stop to discover eyes and, on Medium, a pink retro desktop |

## The work

![Featured engineering projects displayed as glass cards with build photos](docs/images/portfolio-projects.webp)

- **Robotics & mechanisms** — swerve drivetrains, FTC robots, odometry pods, and club builds.
- **Devices & fabrication** — a custom CoreXY printer, a digital camera, transit displays, and an animated electronic keychain.
- **The process behind them** — CAD, code, build photos, videos, and project write-ups covering the problem, method, and result.
- **Experience & learning** — City Tech coursework, NYC FIRST internships, research, awards, and technical skills.

Featured cards open into detailed project sheets. The archive groups the rest into personal projects, work, clubs, research, and classes.

## Behind the site

Built from scratch with **HTML, CSS, and JavaScript**, hosted on **GitHub Pages**. No framework or build step. Content comes from `portfolio-data.json`; fonts, icons, and images are self-hosted.

<details>
<summary><strong>Run locally or edit the portfolio</strong></summary>

From the repository root:

```bash
python -m http.server 8000
```

Open [localhost:8000](http://localhost:8000). A local server is needed to load the project data.

Edit `portfolio-data.json` for content; use `portfolio-template.json` for the format. Validate with:

```bash
python tools/check-data.py
```

See the [maintenance guide](docs/MAINTENANCE.md) for file roles, media tools, design tokens, caching, and content editing, or the [performance tools](tools/perf/README.md) for browser checks.

</details>
