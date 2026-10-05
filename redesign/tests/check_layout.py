"""UI-only checks. No call, recording, login or payment is initiated.
Requires Python and Playwright with Chromium available.
"""
from pathlib import Path
import base64
import hashlib
import json
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WIDTHS = (1440, 1024, 768, 620, 390, 320)


def main() -> None:
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'styles.css').read_text(encoding='utf-8')
    logo = (ROOT / 'assets/logo.svg').read_bytes()
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + css + '</style>')
    html = html.replace('assets/logo.svg', 'data:image/svg+xml;base64,' + base64.b64encode(logo).decode())
    report = {'scope': 'UI only; no production deployment or backend tests', 'viewports': {}}
    executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    launch = {'headless': True}
    if executable:
        launch['executable_path'] = executable
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch)
        try:
            for width in WIDTHS:
                page = browser.new_page(viewport={'width': width, 'height': 1000}, device_scale_factor=1)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.set_content(html, wait_until='load')
                data = page.evaluate('''() => ({
                    viewport: innerWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    h1Count: document.querySelectorAll('h1').length,
                    failedImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length,
                    missingAnchors: [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.getElementById(a.hash.slice(1))).length
                })''')
                assert data['scrollWidth'] <= width, data
                assert data['h1Count'] == 1 and data['failedImages'] == 0 and data['missingAnchors'] == 0, data
                assert not errors, errors
                if width == 390:
                    menu = page.locator('.mobile-menu')
                    menu.locator('summary').click()
                    assert menu.get_attribute('open') is not None
                    menu.locator('a[href="#comment"]').click()
                    assert menu.get_attribute('open') is None
                    page.locator('.faq-item').first.locator('summary').click()
                    assert page.locator('.faq-item').first.get_attribute('open') is not None
                    menu.locator('summary').click()
                    page.keyboard.press('Escape')
                    assert menu.get_attribute('open') is None
                    data['menuAndFaq'] = 'passed'
                data['javascriptErrors'] = len(errors)
                report['viewports'][str(width)] = data
                page.close()
            # Native menu and FAQ remain operable without JavaScript.
            page = browser.new_page(viewport={'width': 390, 'height': 844}, java_script_enabled=False)
            page.set_content(html, wait_until='load')
            page.locator('.mobile-menu summary').click()
            assert page.locator('.mobile-menu').get_attribute('open') is not None
            page.locator('.mobile-menu summary').click()
            page.locator('.faq-item').first.locator('summary').click()
            assert page.locator('.faq-item').first.get_attribute('open') is not None
            report['nativeControlsWithoutJavascript'] = 'passed'
            page.close()
        finally:
            browser.close()
    report['gitBlobHashes'] = {}
    for name in ('index.html', 'styles.css', 'assets/logo.svg'):
        content = (ROOT / name).read_bytes()
        report['gitBlobHashes'][name] = hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest()
    output = ROOT / 'tests/layout-report.json'
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(output.read_text(encoding='utf-8'))


if __name__ == '__main__':
    main()
