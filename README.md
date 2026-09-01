# Angelo Demetroulakos — Engineering Portfolio

This is the source for my personal engineering portfolio: [aloeveraz.github.io](https://aloeveraz.github.io/).

I use the site to keep my robotics, CAD, controls, manufacturing, and 3D-printing work in one place. The project cards come from one JSON file, so I can add a build without rewriting the page layout each time.

## Files

- `index.html` contains the page structure and project modal.
- `portfolio.css` handles the layout, responsive styles, and visual effects.
- `portfolio.js` renders the profile, project collections, carousels, and modal content.
- `portfolio-data.json` holds the profile, skills, project write-ups, media, and links.
- `assets/` contains the project photos, GIFs, and graphics.
- `project-example.json` is a project record I can copy when adding something new.

## Run locally

The portfolio is a static site, but it needs a local server so the browser can load the JSON file.

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Add a project

1. Add the project images to `assets/`.
2. Copy the record in `project-example.json` into the `projects` array in `portfolio-data.json`.
3. Replace the example values and set `category` and `collectionOrder`.
4. Set `featured` to `true` and add a `featuredOrder` when the project belongs in the first row.
5. Run the site locally and check the card, project modal, links, and mobile layout.

Empty links and media fields are skipped by the page, so unfinished material can stay out of the public portfolio until it is ready.
