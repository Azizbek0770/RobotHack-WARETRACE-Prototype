"""Bounded QR and barcode decoding for receiving."""

from dataclasses import dataclass
from io import BytesIO

import zxingcpp
from PIL import Image, UnidentifiedImageError

MAX_UPLOAD_BYTES = 3 * 1024 * 1024
MAX_IMAGE_PIXELS = 8_000_000
MAX_RESULTS = 10
MAX_CODE_LENGTH = 256


class InvalidScanImage(ValueError):
    pass


class ScanImageTooLarge(ValueError):
    pass


@dataclass(frozen=True)
class DecodedBarcode:
    value: str
    symbology: str


def decode_barcodes(data: bytes) -> list[DecodedBarcode]:
    if not data:
        raise InvalidScanImage("Image is empty")

    if len(data) > MAX_UPLOAD_BYTES:
        raise ScanImageTooLarge("Image exceeds 3 MiB limit")

    # Reject formats outside our intended PNG/JPEG pipeline
    # before invoking the image decoder.
    is_png = data.startswith(b"\x89PNG\r\n\x1a\n")
    is_jpeg = data.startswith(b"\xff\xd8\xff")

    if not (is_png or is_jpeg):
        raise InvalidScanImage("Only PNG and JPEG images are supported")

    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in {"PNG", "JPEG"}:
                raise InvalidScanImage("Unsupported image format")

            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ScanImageTooLarge("Image exceeds the 8-megapixel limit")

            if getattr(image, "n_frames", 1) != 1:
                raise InvalidScanImage("Animated or multi-frame images are unsupported")

            image.load()
            rgb_image = image.convert("RGB")

    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise InvalidScanImage("Corrupt or invalid image") from exc

    try:
        barcodes = zxingcpp.read_barcodes(rgb_image)
    except (ValueError, RuntimeError) as exc:
        raise InvalidScanImage("Barcode decoding failed") from exc

    results: list[DecodedBarcode] = []
    seen: set[tuple[str, str]] = set()

    for barcode in barcodes:
        value = barcode.text
        symbology = str(barcode.format)

        if not value or len(value) > MAX_CODE_LENGTH:
            continue

        key = (value, symbology)

        if key in seen:
            continue

        seen.add(key)
        results.append(
            DecodedBarcode(
                value=value,
                symbology=symbology,
            )
        )

        if len(results) >= MAX_RESULTS:
            break

    return results
