# Labeler
Uses the [Skyware labeler](https://github.com/skyware-js/labeler/tree/main) repo

Listens to all new posts via the Jetstream and checks posts with link facets or embeds using regular expressions to determine if it is a Substack link

The labeler will request headers if the regular expression is false, allowing it to detect if it is a custom domain served by Substack
