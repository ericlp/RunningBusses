# 042 – Navigate to start

Status: done.

- A "Navigera till start" link in the course details and on the line card opens Google Maps walking directions to the first point of the course (or line).
- `src/domain/navigate.ts`: `courseStart(legs)` and `directionsUrl`. No location permission or backend is needed.
- Hidden when a course has no legs.
