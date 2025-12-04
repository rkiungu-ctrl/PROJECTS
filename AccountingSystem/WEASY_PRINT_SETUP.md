WeasyPrint and Playwright setup (Windows + WSL)
===============================================

This document helps you get the HTML->PDF path working for payslips in this project.

Background
----------
- The backend prefers WeasyPrint + Jinja2 to render HTML to PDF exactly like the frontend.
- WeasyPrint depends on native libraries (Cairo, Pango, GDK-Pixbuf/glib) that are not always present on Windows.
- To avoid platform pain, the project includes a Chromium (Playwright) fallback which renders the same Jinja HTML using headless Chromium and produces a PDF.

Options
-------
1) Use WeasyPrint (recommended for Linux/WSL). This gives native HTML->PDF rendering.
2) Use Playwright (Chromium) fallback (recommended on Windows if you don't want to install native libs).

Quick: recommended (WSL) install steps
--------------------------------------
1. Start WSL (Ubuntu) and open a shell.

2. Install native libs and Python packages:

```bash
sudo apt update
sudo apt install -y libcairo2 libpango-1.0-0 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info

# Activate your project venv inside WSL, then:
pip install --upgrade pip
pip install -r /mnt/c/PROJECTS/AccountingSystem/requirements.txt
# or at minimum:
pip install weasyprint==65.1 jinja2 PyPDF2 playwright
python -m playwright install
```

3. Verify WeasyPrint works:

```bash
python - <<'PY'
from weasyprint import HTML
HTML(string='<p>Hello WeasyPrint</p>').write_pdf('test_weasy.pdf')
print('wrote test_weasy.pdf')
PY
```

If that writes `test_weasy.pdf` you are good. If it fails with missing gobject or a similar error, use the Playwright fallback below.

Playwright (Chromium) fallback (works well on Windows)
-----------------------------------------------------
1. From your project's virtualenv (cmd.exe):

```cmd
# activate venv (adjust path to your venv Scripts\activate)
c:\PROJECTS\AccountingSystem\venv\Scripts\activate
pip install -r c:\PROJECTS\AccountingSystem\requirements.txt
python -m playwright install
```

2. Test Playwright PDF rendering quickly:

```python
from playwright.sync_api import sync_playwright
html = '<html><body><h1>Playwright test</h1><p>hello</p></body></html>'
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.set_content(html, wait_until='networkidle')
    pdf = page.pdf(format='A4', print_background=True)
    open('test_playwright.pdf','wb').write(pdf)
    browser.close()
print('wrote test_playwright.pdf')
```

Encryption / password protection
--------------------------------
- The backend enforces password protection (employee national ID) when sending PDFs.
- Encryption is implemented using PyPDF2. Ensure `PyPDF2` is installed in the venv so the server can encrypt PDFs before returning or emailing them.

Quick tests after install
-------------------------
1. Restart the backend (uvicorn).
2. Call the payslip PDF endpoint in a browser for an employee that has `id_number` set. If PyPDF2 is installed, the PDF viewer should prompt for a password (the employee's ID). If the server refuses with a 500 error about missing PyPDF2, install PyPDF2 and retry.

Troubleshooting
---------------
- If WeasyPrint errors with `cannot load library 'gobject-2.0-0'` install the native libs via WSL or MSYS2. WSL is easier.
- If Playwright fails to launch a browser, run `python -m playwright install` and ensure the process has network access to download browsers.
- If PDFs open without password, verify that `PyPDF2` is installed in the same Python environment the server is running in.

Notes for production
--------------------
- If you plan to produce many PDFs per minute, consider using a persistent Playwright browser instance or a small pool of browser processes instead of launching a new browser per request (I can add this optimization).
- Keep credentials and SMTP settings in environment variables; do not commit them to source.

If you want, I can add an automated browser pool and a short script to warm it on startup — say the word and I'll implement it.
