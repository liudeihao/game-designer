"""Project illustrations: immutable image+prompt records under .studio/."""

from .service import (
    IllustrationError,
    compile_prompt,
    generate_illustration,
    get_image,
    get_record,
    get_settings,
    list_illustrations,
    place_illustration,
    public_record,
    save_settings,
)

__all__ = [
    "IllustrationError",
    "compile_prompt",
    "generate_illustration",
    "get_image",
    "get_record",
    "get_settings",
    "list_illustrations",
    "place_illustration",
    "public_record",
    "save_settings",
]
