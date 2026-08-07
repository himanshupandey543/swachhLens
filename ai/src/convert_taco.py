import json
import shutil
from pathlib import Path
from PIL import Image

# Paths
taco_root = Path("ai/datasets/taco")
annotation_file = taco_root / "annotations.json"

output_images = taco_root / "images"
output_labels = taco_root / "labels"

output_images.mkdir(exist_ok=True)
output_labels.mkdir(exist_ok=True)

# Load COCO annotations
with open(annotation_file, "r") as f:
    coco = json.load(f)

# Image dictionary
images = {img["id"]: img for img in coco["images"]}

# Group annotations by image
annotations = {}

for ann in coco["annotations"]:
    image_id = ann["image_id"]
    annotations.setdefault(image_id, []).append(ann)

print(f"Total Images: {len(images)}")
print(f"Total Annotations: {len(coco['annotations'])}")

for image_id, image_info in images.items():

    filename = image_info["file_name"]

    src = taco_root / filename

    if not src.exists():
        continue

    dst = output_images / Path(filename).name

    shutil.copy(src, dst)

    width = image_info["width"]
    height = image_info["height"]

    label_path = output_labels / (Path(filename).stem + ".txt")

    with open(label_path, "w") as f:

        if image_id not in annotations:
            continue

        for ann in annotations[image_id]:

            x, y, w, h = ann["bbox"]

            x_center = (x + w / 2) / width
            y_center = (y + h / 2) / height
            w /= width
            h /= height

            class_id = 0

            f.write(
                f"{class_id} "
                f"{x_center:.6f} "
                f"{y_center:.6f} "
                f"{w:.6f} "
                f"{h:.6f}\n"
            )

print("Conversion completed successfully!")