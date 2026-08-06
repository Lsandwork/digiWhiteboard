# Blog Generator help guide — visual notes

## Route
`/admin/blog/help/how-to-use-blog-generator`

Also reachable from:
- Blog Generator sidebar → Settings → How to Use
- Blog top-bar help icon
- Staff Help Center article “How to Use the Fitdog Blog Generator”
- `/admin/automatic-blog?page=help` (redirect)

## Mockup
Approved mockup binary was not present on the agent filesystem at
`/mnt/data/ChatGPT Image Aug 5, 2026 at 07_01_19 PM.png`.
Layout follows the attached high-fidelity mockup description and Fitdog brand tokens (`#ff6f26`, navy headings, peach hero).

## Screenshot fixtures
Dev-safe UI fixtures (no private data) live in:
`public/assets/fitdog/blog-help/*-fixture.png`

Regenerate with Playwright against `/tmp/blog-help-fixtures.html` if the dashboard chrome changes materially.

## Tutorial video
Configure `provider_config.help_tutorial_video_url` in Blog Settings, or set
`NEXT_PUBLIC_BLOG_TUTORIAL_VIDEO_URL` / `BLOG_TUTORIAL_VIDEO_URL`.
Without a URL, the hero CTA shows “Tutorial Video Not Configured”.
