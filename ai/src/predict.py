from ultralytics import YOLO


def predict_image(model_path, image_path):
    # Load trained YOLO model
    model = YOLO(model_path)

    # Run prediction
    results = model.predict(
        source=image_path,
        conf=0.25,
        save=True
    )

    print("Prediction completed successfully!")

    for result in results:
        print(f"Detected objects: {len(result.boxes)}")


if __name__ == "__main__":
    model_path = "ai/models/best.pt"
    image_path = r"D:\Technova\SwachhLens\swachhLens-github\ai\datasets\roboflow\test\images\27de75ae-679b-11e5-af8c-40f2e96c8ad8_jpg.rf.9f61052dcf5f3291fa8b8326c813c9ed.jpg"

    predict_image(model_path, image_path)