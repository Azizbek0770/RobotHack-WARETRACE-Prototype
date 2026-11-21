from io import BytesIO

import pytest
import zxingcpp
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.vision.decode import MAX_UPLOAD_BYTES

client = TestClient(app)
ENDPOINT = "/api/v1/intake/decode"


def make_barcode(
    value: str,
    format: zxingcpp.BarcodeFormat,
) -> bytes:
    barcode = zxingcpp.create_barcode(value, format)
    raster = barcode.to_image(scale=6)

    buffer = BytesIO()
    Image.fromarray(raster).save(buffer, format="PNG")
    return buffer.getvalue()


def upload(
    content: bytes,
    mime: str = "image/png",
):
    return client.post(
        ENDPOINT,
        files={
            "image": ("scan.png", content, mime),
        },
    )


@pytest.mark.parametrize(
    "format",
    [
        zxingcpp.BarcodeFormat.QRCode,
        zxingcpp.BarcodeFormat.Code128,
    ],
)
def test_decodes_real_barcode_images(format):
    image = make_barcode("HU-0001", format)

    response = upload(image)

    assert response.status_code == 200
    assert any(item["value"] == "HU-0001" for item in response.json()["codes"])


def test_blank_image_returns_no_barcodes():
    buffer = BytesIO()

    Image.new(
        "RGB",
        (480, 480),
        "white",
    ).save(buffer, format="PNG")

    response = upload(buffer.getvalue())

    assert response.status_code == 200
    assert response.json() == {"codes": []}


def test_corrupt_image_is_rejected():
    response = upload(b"\x89PNG\r\n\x1a\ninvalid-image")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def test_unsupported_file_type_is_rejected():
    response = upload(
        b"example",
        mime="text/plain",
    )

    assert response.status_code == 415


def test_oversized_image_is_rejected():
    response = upload(b"\x89PNG\r\n\x1a\n" + b"x" * MAX_UPLOAD_BYTES)

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "UPLOAD_TOO_LARGE"


def test_empty_image_is_rejected():
    response = upload(b"")

    assert response.status_code == 400
