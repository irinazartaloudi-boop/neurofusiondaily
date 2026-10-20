# NeuroFusion Daily — Editable Website

This version **keeps the existing design** and adds structured content files for an online editing dashboard.

## How editing will work after setup

1. Sign into [Pages CMS](https://pagescms.org/) using GitHub.
2. Select your `neurofusiondaily` repository.
3. Open **Website text & headings** to edit homepage/About headings and paragraphs; **Articles** to add/edit/delete articles; or **Protocols** to update products.
4. Save. Pages CMS commits your changes to GitHub.
5. Cloudflare Pages detects the GitHub update and runs the build automatically. Changes appear on the website after deployment.

**Important:** The editing dashboard is *not live yet*. The repository and hosting integration must be connected in your own accounts first. Pages CMS is a third-party service, not a self-hosted admin app. Confirm its current plan/feature availability during setup.

## Initial setup (one time)

1. Create a free GitHub account if needed. Create a **private** repository named `neurofusiondaily` (or use a public one if preferred).
2. Upload the **source project contents**, including the hidden `.pages.yml` file, to the repository root. Do not upload only the `dist` folder.
3. In Cloudflare Pages, choose **Connect to Git** and authorise access to that repository.
4. Build command: `pip install -r requirements.txt && python build.py`
5. Build output directory: `dist`
6. After the Cloudflare preview site works, open pagescms.org, sign in with GitHub, and grant the CMS access to your repository. The `.pages.yml` file defines editable sections.
7. Test by changing the hero heading in Pages CMS and checking that Cloudflare publishes the change.
8. Only after successful testing, connect `neurofusiondaily.com` in Cloudflare and follow the precise DNS instructions in GoDaddy. Preserve existing email-related DNS records.

## Local preview / rebuild

Install Python and run:

    pip install -r requirements.txt
    python build.py

Open `dist/index.html` locally. `dist` contains the finished site. `templates` preserves the original visual layouts; `content` contains all editable text.

## Content editing notes

- Website headings and paragraphs are stored in `content/site.json`.
- Each article is stored in `content/articles/<slug>.json`.
- Each product is stored in `content/protocols/<slug>.json`.
- For article text, `body_html` currently uses HTML paragraphs (e.g. `<p>Your text</p>`). This is not yet a Word-like rich-text editor; a more friendly editing experience would be a subsequent improvement.
- Do not change a published article's slug casually: it changes the URL.
- Product checkout links remain empty until payment and private file-delivery services are configured. Never upload paid PDFs to the public repository.
- Existing articles are imported verbatim and require scientific review before commercial launch.
- Newsletter subscriptions, legal pages, actual portrait, payment and automatic PDF delivery remain unconfigured.

## Costs

Cloudflare Pages and GitHub offer free plans suitable for many small projects, subject to provider limits and policies. Domain renewal through GoDaddy remains payable. Pages CMS availability/pricing should be confirmed before relying on it.
