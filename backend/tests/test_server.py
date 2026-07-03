from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_api_optimize_empty():
    response = client.post("/api/optimize", json={"courses": []})
    assert response.status_code == 200
    # The Pydantic model might default error to None, so we verify schedules list is empty
    data = response.json()
    assert data["schedules"] == []

def test_api_optimize_valid():
    payload = {
        "courses": [
            {
                "course_name": "CSE101",
                "raw_text": "A\nTeacher A\nMonday 10:00-11:30"
            }
        ]
    }
    response = client.post("/api/optimize", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["schedules"]) == 1
    assert data["schedules"][0][0]["course_name"] == "CSE101"
    assert data["schedules"][0][0]["section"]["name"] == "A"

def test_api_optimize_invalid_format():
    payload = {
        "courses": [
            {
                "course_name": "CSE101",
                "raw_text": "A\nTeacher A\nInvalidDay 10:00-11:30"
            }
        ]
    }
    response = client.post("/api/optimize", json=payload)
    assert response.status_code == 400
    assert "Invalid day name" in response.json()["detail"]

def test_api_optimize_duplicate_course_name():
    # Two input entries for CSE101. One has section A (Mon 10:00-11:00), the other has section B (Mon 12:00-13:00)
    # The server should group them and return 2 separate conflict-free schedules (one with A, one with B)
    payload = {
        "courses": [
            {
                "course_name": "CSE101",
                "raw_text": "A\nTeacher A\nMonday 10:00-11:00"
            },
            {
                "course_name": "CSE101",
                "raw_text": "B\nTeacher B\nMonday 12:00-13:00"
            }
        ]
    }
    response = client.post("/api/optimize", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["schedules"]) == 2
    
    sections_found = {sch[0]["section"]["name"] for sch in data["schedules"]}
    assert sections_found == {"A", "B"}

def test_api_courses_get_empty(monkeypatch, tmp_path):
    import os
    from backend import main
    temp_file = tmp_path / "courses.json"
    monkeypatch.setattr(main, "COURSES_FILE", str(temp_file))
    
    response = client.get("/api/courses")
    assert response.status_code == 200
    assert response.json() == []

def test_api_courses_save_and_load(monkeypatch, tmp_path):
    import os
    from backend import main
    temp_file = tmp_path / "courses.json"
    monkeypatch.setattr(main, "COURSES_FILE", str(temp_file))
    
    saved_courses = [
        {"id": 1, "name": "CSE101", "text": "A\nTeacher A\nMonday 10:00-11:00"}
    ]
    
    # Save via POST endpoint
    response = client.post("/api/courses", json=saved_courses)
    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    
    # Verify file was written
    assert os.path.exists(temp_file)
    
    # Load via GET endpoint
    response_get = client.get("/api/courses")
    assert response_get.status_code == 200
    assert len(response_get.json()) == 1
    assert response_get.json()[0]["name"] == "CSE101"


def test_api_courses_update_and_delete(monkeypatch, tmp_path):
    from backend import main
    temp_file = tmp_path / "courses.json"
    monkeypatch.setattr(main, "COURSES_FILE", str(temp_file))

    initial_courses = [
        {"id": 1, "name": "CSE101", "text": "A\nTeacher A\nMonday 10:00-11:00"},
        {"id": 2, "name": "CSE102", "text": "B\nTeacher B\nTuesday 12:00-13:00"},
    ]

    response = client.post("/api/courses", json=initial_courses)
    assert response.status_code == 200

    update_payload = {"id": 2, "name": "CSE102 Updated", "text": "B\nTeacher B\nTuesday 12:30-13:30"}
    response_update = client.put("/api/courses/2", json=update_payload)
    assert response_update.status_code == 200
    assert response_update.json()["name"] == "CSE102 Updated"

    response_get = client.get("/api/courses")
    assert response_get.status_code == 200
    courses = response_get.json()
    assert len(courses) == 2
    assert courses[1]["name"] == "CSE102 Updated"

    response_delete = client.delete("/api/courses/1")
    assert response_delete.status_code == 200
    assert response_delete.json() == {"status": "success"}

    response_get_after_delete = client.get("/api/courses")
    assert response_get_after_delete.status_code == 200
    remaining = response_get_after_delete.json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == 2
