# SEC-10 upload test files (harmless samples)

| File | Use in test | Expected on v1 |
|---|---|---|
| `real-photo.jpg`, `real-photo.png` | T-10a: progress photo | 201, viewable |
| `real-certificate.pdf` | T-10a: certificate | 201, downloads as attachment |
| `html-disguised-as-photo.jpg` | T-10b: HTML page renamed `.jpg` | 400 "This file type is not allowed" |
| `html-disguised-as-cert.pdf` | T-10b: HTML page renamed `.pdf` | 400 |
| `exe-disguised-as-cert.pdf` | T-10b: Windows .exe header renamed `.pdf` | 400 (detected `application/x-msdownload`) |
| `svg-script-disguised-as-photo.png` | Extra: SVG with `<script>` | 400 |
| `polyglot-png-with-html.png` | Extra: real PNG with HTML appended | 201, but served as `image/png` + `nosniff` + sandbox CSP, so the HTML never runs |

T-10c (6 MB): create one with `mkfile 6m big.pdf` (macOS) or `fsutil file createnew big.pdf 6291456` (Windows) → 400 "maximum size is 5 MB".
T-10d: rename `real-certificate.pdf` to `../../evil<script>.pdf` in the request (ZAP Requester / Burp), or any name with odd characters → stored under a random UUID; name cleaned.

**On v0 (baseline, not verified by the AI):** v0 accepts any file and serves it back with whatever Content-Type the client sent,
without `nosniff`. To test for stored XSS on v0, upload `html-disguised-as-photo.jpg` but change the multipart part's
`Content-Type` to `text/html` (and/or the filename to `.html`) in ZAP Requester. Then open `/api/progress/photos/<id>/file`
as the member's trainer and see whether the script runs. On v1 the same request is rejected with 400.
