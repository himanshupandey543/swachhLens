import shutil
from pathlib import Path

base = Path("ai/datasets")

taco = base / "taco"
combined = base / "combined"

train_images = combined / "train" / "images"
train_labels = combined / "train" / "labels"

count = 0

for img in (taco / "images").glob("*.jpg"):

    new_name = f"taco_{img.name}"

    shutil.copy2(img, train_images / new_name)

    label = taco / "labels" / f"{img.stem}.txt"

    if label.exists():
        shutil.copy2(label, train_labels / f"taco_{label.name}")

    count += 1

print(f"Successfully copied {count} TACO images.")  