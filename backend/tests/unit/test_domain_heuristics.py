import pytest
from app.services.duplicate_detection_service import is_photographic
from tests.fixtures.synthetic_images import (
    create_solid_image,
    create_grayscale_image,
    create_line_art_image,
    create_natural_photo_image,
)


@pytest.mark.unit
def test_is_photographic_grayscale_mode():
    img_l = create_grayscale_image()
    assert is_photographic(img_l) is False


@pytest.mark.unit
def test_is_photographic_solid_color():
    img_solid = create_solid_image(color=(128, 128, 128))
    assert is_photographic(img_solid) is False


@pytest.mark.unit
def test_is_photographic_line_art():
    img_lineart = create_line_art_image()
    # Line art on flat white background has low RGB variance / grayscale characteristics
    assert is_photographic(img_lineart) is False


@pytest.mark.unit
def test_is_photographic_natural_photo():
    img_photo = create_natural_photo_image(size=(128, 128))
    assert is_photographic(img_photo) is True
