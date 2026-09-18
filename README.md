# GoodKota MVP v7 — Kota Authority Build

This build deliberately trims the previous broad platform into the smallest product that can prove the GoodKota thesis:

> **GoodKota tells you where the good kota is.**

## MVP loop

1. Customer opens GoodKota.
2. Nearby kota spots are ranked by proximity.
3. GoodKota makes the quality standard visible.
4. Customer opens, saves, gets directions, or places a pickup order.
5. GoodKota measures whether the customer comes back and repeats a qualified action on another day.

## North-star metric

**30-day Repeat Finder Rate**

`users with qualified GoodKota actions on 2+ different days in 30 days / users with at least 1 qualified action in 30 days`

Qualified actions in this prototype:
- merchant open
- favourite/save
- directions intent
- pickup order

This keeps the metric tied to repeat GoodKota use rather than vanity traffic.

## GoodKota Standard

A listing becomes a GoodKota Pick only when all five checks pass:

1. Local & independent
2. Kota is core
3. Consistent food
4. Fair value
5. Ready to serve

## Included now

- customer discovery, search and simple filters
- proximity-led merchant cards
- visible GoodKota Standard
- merchant detail and menu
- saved merchants
- lightweight pickup ordering
- customer order history
- merchant pickup queue
- menu availability and open/closed status
- GoodKota verification queue
- repeat-behaviour dashboard
- PWA manifest + service worker

## Deliberately removed from the MVP

- driver application
- delivery operations/dispatch
- live GPS tracking
- complex settlement operations
- subscriptions
- promotions engine
- social/community feed
- complex loyalty programme
- broad multi-category discovery

Those are expansion options, not launch dependencies.

## Run locally

Because the app uses ES modules, serve the folder over HTTP:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

The build uses relative paths and can be hosted directly from the repository root on GitHub Pages.

## Prototype note

The role selector is a demo control only. Production should use real authentication and server-side role enforcement. Prototype state is stored in `localStorage`; this is not a production data layer.
