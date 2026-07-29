"""Re-split sheets with larger insets and cleaner transparency."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ASSETS = Path(r"C:\Users\slhol\.cursor\projects\d-Research-gaming-service\assets")
OUT = Path(r"D:\Research\gaming-service\public\assets\items")
OUT.mkdir(parents=True, exist_ok=True)

SHEETS = {
    "gen1": {
        "path": ASSETS
        / "c__Users_slhol_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_gen-aba0415e-0db8-4f31-a13f-a193507b834e.png",
        "rows": 4,
        "cols": 5,
        "inset": 10,
        "names": [
            "gear_watch",
            "tesla_coil",
            "clockwork_key",
            "skeleton_key",
            "pressure_gauge",
            "acoustic_horn",
            "pipe_valve",
            "fern_specimen_jar",
            "plasma_lamp",
            "nav_compass",
            "valve_wheel",
            "conductive_pedestal",
            "magnifying_glass",
            "gate_valve",
            "puzzle_box",
            "kerosene_lantern",
            "prism_crystal",
            "leather_journal",
            "mech_spider",
            "jeweled_key",
        ],
    },
    "gen2": {
        "path": ASSETS
        / "c__Users_slhol_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_gen2-ce91b792-68b7-4273-a8ed-741731c18feb.png",
        "rows": 4,
        "cols": 6,
        "inset": 12,
        "names": [
            "herb_jar",
            "blue_vial",
            "fern_vial",
            "framed_flask",
            "iridescent_elixir",
            "floral_canister",
            "botanical_atomizer",
            "hex_jar",
            "conical_flask_dry",
            "graduated_flask",
            "copper_coiled_vial",
            "tripod_sphere",
            "cobalt_bottle",
            "strap_cap_jar",
            "seed_jar",
            "banded_moss_jar",
            "porthole_frame",
            "dropper_bottle",
            "pump_sprayer",
            "herb_cylinder",
            "crystal_jar",
            "pressure_gauge_device",
            "geared_bottle",
            "lattice_flower_jar",
        ],
    },
    "gen3": {
        "path": ASSETS
        / "c__Users_slhol_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_gen3-e3a4f698-d711-41ef-a49f-95810fd776d6.png",
        "rows": 4,
        "cols": 8,
        "inset": 8,
        "names": [
            "brass_astrolabe",
            "circular_dial",
            "crystal_globe_ring",
            "alchemical_flask",
            "prism_stand",
            "crystal_flask",
            "barometer_tube",
            "balance_scale",
            "complex_gauge",
            "stained_globe",
            "flask_blue_crystals",
            "tall_vial",
            "lab_clock",
            "simple_microscope",
            "brass_telescope",
            "test_tube_rack_a",
            "power_cell_orb",
            "scientist_journal",
            "ornate_valve_a",
            "ornate_valve_b",
            "test_tubes_glow",
            "test_tubes_layers",
            "pressure_valve_assy",
            "small_valve_knob",
            "compound_microscope",
            "locked_tome",
            "large_gear_wheel",
            "adj_knob",
            "mineral_jar",
            "storage_chest",
            "eyepiece_holster",
            "music_box_label",
        ],
    },
    "gen4": {
        "path": ASSETS
        / "c__Users_slhol_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_gen4-c5e9731a-d4e7-49fb-b349-6597871d30d9.png",
        "rows": 4,
        "cols": 6,
        "inset": 12,
        "names": [
            "brass_sphere_eye",
            "mechanical_orb",
            "jar_hook",
            "organic_eye_a",
            "steampunk_scope",
            "organic_horn_eye",
            "leather_battery",
            "fossil_bone_a",
            "jar_roots",
            "cabled_eye",
            "brass_alembic",
            "mech_engine_part",
            "steampunk_wrench",
            "red_light_cylinder",
            "jar_red_specimen",
            "jar_dark_vapor",
            "brass_nozzle",
            "cylindrical_tube",
            "small_power_hub",
            "mechanical_heart",
            "fossil_bone_b",
            "heavy_conduit",
            "hide_journal",
            "reinforced_chest",
        ],
    },
}


def make_transparent(cell: Image.Image, threshold: int = 242) -> Image.Image:
    rgba = cell.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # Near-white paper / grid
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (0, 0, 0, 0)
            # Soft anti-aliased white edges
            elif r > 220 and g > 220 and b > 220 and min(r, g, b) > 200:
                avg = (r + g + b) / 3
                alpha = max(0, int(255 * (1 - (avg - 200) / 55)))
                pixels[x, y] = (r, g, b, alpha)

    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)

    pad = 10
    padded = Image.new("RGBA", (rgba.width + pad * 2, rgba.height + pad * 2), (0, 0, 0, 0))
    padded.paste(rgba, (pad, pad), rgba)
    return padded


def split_sheet(key: str, cfg: dict) -> int:
    img = Image.open(cfg["path"]).convert("RGBA")
    rows, cols = cfg["rows"], cfg["cols"]
    names = cfg["names"]
    inset = cfg["inset"]
    cell_w = img.width // cols
    cell_h = img.height // rows
    count = 0
    idx = 0
    for r in range(rows):
        for c in range(cols):
            if idx >= len(names):
                break
            left = c * cell_w + inset
            top = r * cell_h + inset
            right = (c + 1) * cell_w - inset
            bottom = (r + 1) * cell_h - inset
            cell = img.crop((left, top, right, bottom))
            out = make_transparent(cell)
            out.save(OUT / f"{names[idx]}.png", optimize=True)
            count += 1
            idx += 1
    print(f"{key}: wrote {count}")
    return count


def main() -> None:
    total = sum(split_sheet(k, cfg) for k, cfg in SHEETS.items())
    print(f"Total sprites: {total} -> {OUT}")


if __name__ == "__main__":
    main()
