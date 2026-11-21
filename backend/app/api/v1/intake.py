"""Receiving image decoding endpoint."""

from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.vision.decode import (
    MAX_UPLOAD_BYTES,
    InvalidScanImage,
    ScanImageTooLarge,
    decode_barcodes,
)

router = APIRouter(
    prefix="/intake",
    tags=["Receiving"],
)


class BarcodeRead(BaseModel):
    value: str
    symbology: str


class DecodeResponse(BaseModel):
    codes: list[BarcodeRead]


@router.post(
    "/decode",
    response_model=DecodeResponse,
)
def decode_image(
    image: Annotated[UploadFile, File()],
) -> DecodeResponse:
    try:
        if image.content_type not in {
            "image/jpeg",
            "image/png",
        }:
            raise HTTPException(
                status_code=415,
                detail="Upload a PNG or JPEG image",
            )

        # Read one byte beyond the limit to detect oversized files.
        data = image.file.read(MAX_UPLOAD_BYTES + 1)

        try:
            decoded = decode_barcodes(data)
        except ScanImageTooLarge as exc:
            raise HTTPException(
                status_code=413,
                detail=str(exc),
            ) from exc
        except InvalidScanImage as exc:
            raise HTTPException(
                status_code=400,
                detail=str(exc),
            ) from exc

        return DecodeResponse(
            codes=[
                BarcodeRead(
                    value=item.value,
                    symbology=item.symbology,
                )
                for item in decoded
            ]
        )
    finally:
        image.file.close()
