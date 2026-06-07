#!/usr/bin/env python3
"""Frontend E2E tests for paint-preview-app using Playwright.

Usage:
  python3 -m pip install -r test-scripts/requirements.txt
  python3 -m playwright install chromium
  python3 test-scripts/frontend_e2e_playwright.py --app-url http://localhost:8080
"""

from __future__ import annotations

import argparse
import base64
import os
import tempfile
from pathlib import Path

from playwright.sync_api import Error, expect, sync_playwright

# Tiny valid 16x16 PNG (gray checker-like image)
PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAeUlEQVR4nGNkYGD4z0ABYBxVSFJQ"
    "WJBhQKqB8T8GQ3wGkI7hP4ZgZGBgYJgM0iA7jFQ0h6E0Q0wQ4l8w0B8iM2QYg4gWwEwG0hVgqgMZg5"
    "jGQYQOQmI0QhQ8B4E0gDkQ6QxgX0D4QwMDAwMDAwAAAwLxQj2m6k5QAAAABJRU5ErkJggg=="
)


def create_temp_image() -> str:
    data = base64.b64decode(PNG_B64)
    tmp = tempfile.NamedTemporaryFile(prefix="paint-test-", suffix=".png", delete=False)
    tmp.write(data)
    tmp.flush()
    tmp.close()
    return tmp.name


def canvas_data_url(page, selector: str) -> str:
    return page.eval_on_selector(selector, "el => el.toDataURL('image/png')")


def run_tests(app_url: str, screenshots_dir: str) -> int:
    os.makedirs(screenshots_dir, exist_ok=True)
    temp_image = create_temp_image()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 900})

            page.goto(app_url, wait_until="networkidle", timeout=30000)
            expect(page).to_have_title("Paint Preview App")

            # Core UI exists
            page.locator("#imageInput").wait_for(state="attached")
            page.locator("#previewCanvas").wait_for(state="visible")
            page.locator("#brushMaskToggle").wait_for(state="attached")
            page.locator("#brushEraseToggle").wait_for(state="attached")
            page.locator("#compareToggle").wait_for(state="attached")
            page.locator("#exportBtn").wait_for(state="attached")

            # Upload image and verify controls are enabled
            page.set_input_files("#imageInput", temp_image)
            expect(page.locator("#exportBtn")).to_be_enabled(timeout=10000)
            expect(page.locator("#brushMaskToggle")).to_be_enabled(timeout=10000)
            expect(page.locator("#brushEraseToggle")).to_be_enabled(timeout=10000)

            # Click canvas center once to simulate interaction before brush flow
            canvas = page.locator("#previewCanvas")
            box = canvas.bounding_box()
            if not box:
                raise RuntimeError("preview canvas has no bounding box")
            cx = box["x"] + box["width"] * 0.5
            cy = box["y"] + box["height"] * 0.45

            page.mouse.click(cx, cy)
            page.wait_for_timeout(150)

            # Brush paint
            page.check("#brushMaskToggle")
            page.wait_for_timeout(100)
            status_brush = page.locator("#maskStatus").inner_text().lower()
            assert "brush" in status_brush, "Mask status should indicate brush mode"
            page.mouse.move(cx, cy)
            page.mouse.down()
            page.mouse.move(cx + 80, cy, steps=8)
            page.mouse.up()
            page.wait_for_timeout(150)

            # Brush erase
            page.check("#brushEraseToggle")
            page.wait_for_timeout(80)
            status_erase = page.locator("#maskStatus").inner_text().lower()
            assert "erase" in status_erase, "Mask status should indicate brush erase mode"
            page.mouse.move(cx + 40, cy)
            page.mouse.down()
            page.mouse.move(cx + 120, cy, steps=8)
            page.mouse.up()
            page.wait_for_timeout(150)

            # Compare mode
            page.check("#compareToggle")
            page.wait_for_timeout(100)
            compare_hidden = page.eval_on_selector("#compareCanvas", "el => el.classList.contains('hidden')")
            assert compare_hidden is False, "Compare canvas should be visible when compare mode is on"

            # Export button should produce download
            with page.expect_download(timeout=10000):
                page.click("#exportBtn")

            page.screenshot(path=str(Path(screenshots_dir) / "frontend-e2e-pass.png"), full_page=True)
            browser.close()

    except Error as e:
        print(f"Playwright runtime error: {e}")
        return 2
    except Exception as e:  # noqa: BLE001
        print(f"Frontend E2E FAILED: {e}")
        return 1
    finally:
        try:
            os.unlink(temp_image)
        except OSError:
            pass

    print("Frontend E2E PASSED")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Playwright E2E tests for paint-preview-app")
    parser.add_argument("--app-url", default="http://localhost:8080")
    parser.add_argument("--screenshots-dir", default="test-scripts/artifacts")
    args = parser.parse_args()
    return run_tests(args.app_url, args.screenshots_dir)


if __name__ == "__main__":
    raise SystemExit(main())
