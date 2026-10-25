
from ultralytics import YOLO
import cv2
import requests
import time
from pathlib import Path

model = YOLO("yolo11n.pt")

VEHICLE_CLASSES = {
    2: "Car",
    3: "Motorcycle",
    5: "Bus",
    7: "Truck",
}

API_URL = "http://localhost:5000/api/traffic"

# Queue-zone coordinates as proportions of video width/height.
# Change these values to fit your road.
ZONE_X1 = 0.20
ZONE_Y1 = 0.45
ZONE_X2 = 0.80
ZONE_Y2 = 0.90


def main():
    video_path = input(
        "Enter traffic video path (or press Enter for webcam): "
    ).strip().strip('"')

    if video_path:
        if not Path(video_path).is_file():
            print("Video file not found. Check the path.")
            return
        cap = cv2.VideoCapture(video_path)
    else:
        cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Could not open video or webcam.")
        return

    last_sent = 0
    print("AI detection and queue counting started.")
    print("Press Q in the video window to quit.")

    try:
        while True:
            success, frame = cap.read()
            if not success:
                break

            height, width = frame.shape[:2]

            # Calculate zone coordinates for this video resolution.
            zx1 = int(ZONE_X1 * width)
            zy1 = int(ZONE_Y1 * height)
            zx2 = int(ZONE_X2 * width)
            zy2 = int(ZONE_Y2 * height)

            results = model.predict(
                source=frame,
                conf=0.35,
                verbose=False
            )

            vehicle_count = 0
            queue_count = 0

            for result in results:
                for box in result.boxes:
                    class_id = int(box.cls[0])

                    if class_id not in VEHICLE_CLASSES:
                        continue

                    vehicle_count += 1

                    x1, y1, x2, y2 = map(
                        int, box.xyxy[0].tolist()
                    )

                    # Bottom-center point of the detected vehicle.
                    center_x = (x1 + x2) // 2
                    bottom_y = y2

                    # Count only vehicles whose bottom-center
                    # point falls inside the queue zone.
                    in_queue_zone = (
                        zx1 <= center_x <= zx2
                        and zy1 <= bottom_y <= zy2
                    )

                    if in_queue_zone:
                        queue_count += 1
                        box_color = (0, 165, 255)  # Orange
                    else:
                        box_color = (0, 220, 0)  # Green

                    label = VEHICLE_CLASSES[class_id]
                    confidence = float(box.conf[0])

                    cv2.rectangle(
                        frame, (x1, y1), (x2, y2),
                        box_color, 2
                    )

                    cv2.putText(
                        frame,
                        f"{label} {confidence:.0%}",
                        (x1, max(y1 - 10, 20)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6, box_color, 2
                    )

            # Draw the queue zone in blue.
            cv2.rectangle(
                frame, (zx1, zy1), (zx2, zy2),
                (255, 0, 0), 3
            )

            cv2.putText(
                frame, "QUEUE ZONE",
                (zx1, max(zy1 - 10, 25)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7, (255, 0, 0), 2
            )

            cv2.putText(
                frame,
                f"Vehicles: {vehicle_count}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8, (0, 255, 255), 2
            )

            cv2.putText(
                frame,
                f"Queue count: {queue_count}",
                (20, 75),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8, (0, 165, 255), 2
            )

            now = time.time()

            # Send readings every 5 seconds.
            if now - last_sent >= 5:
                try:
                    response = requests.post(
                        API_URL,
                        json={
                            "vehicles": vehicle_count,
                            "queue": queue_count,
                            "sensorOnline": True,
                            "simulated": False
                        },
                        timeout=3
                    )
                    response.raise_for_status()

                    print(
                        f"Sent AI count: {vehicle_count} vehicles | "
                        f"Queue: {queue_count}"
                    )
                    last_sent = now

                except requests.RequestException as error:
                    print("Backend connection failed:", error)

            cv2.imshow(
                "Smart Campus - AI Queue Detection", frame
            )

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()
        print("AI detection stopped.")


if __name__ == "__main__":
    main()
