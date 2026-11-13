# Demonstration guide

## Five-minute walkthrough

1. Run `npm start` and open http://localhost:8080.
2. Explore the seeded dashboard and map.
3. Enable Simulate Offline. Submit a fictional report: Demo bridge closure, 12 people, high severity.
4. Change a resource quantity and inspect the queue.
5. Reconnect and select Sync Now. Explain that this changes local state only.
6. Export JSON/CSV before resetting the demonstration database.

## Deployment

Use the included `Dockerfile.demo` to serve only the app assets with Nginx. Build with `docker build -f Dockerfile.demo -t resqnet-demo .`, then run `docker run --rm -p 8080:80 resqnet-demo`. Use HTTPS on a public host for service workers.

## Screenshots and verification

Capture the dashboard, an offline report, and the queue after running the walkthrough.

Existing screenshots are historical assets, not fresh proof of this build. No new runtime screenshots or deployment success are claimed. Before sharing a demo, run the walkthrough, capture only fictional data, and record the commit SHA beside the images.
