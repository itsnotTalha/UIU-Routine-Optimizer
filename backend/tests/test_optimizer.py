from backend.optimizer import solve_schedules, slots_overlap, has_conflict

def test_slots_overlap():
    # Different days
    s1 = {"day": "Monday", "start_mins": 600, "end_mins": 700}
    s2 = {"day": "Tuesday", "start_mins": 600, "end_mins": 700}
    assert not slots_overlap(s1, s2)
    
    # Overlap
    s3 = {"day": "Monday", "start_mins": 650, "end_mins": 750}
    assert slots_overlap(s1, s3)
    
    # Non-overlap (touching)
    s4 = {"day": "Monday", "start_mins": 700, "end_mins": 800}
    assert not slots_overlap(s1, s4)
    
    # Non-overlap (completely separate)
    s5 = {"day": "Monday", "start_mins": 800, "end_mins": 900}
    assert not slots_overlap(s1, s5)

def test_solve_schedules():
    courses = [
        {
            "course_name": "Course A",
            "sections": [
                {
                    "name": "A1",
                    "faculty": "Teacher A",
                    "slots": [{"day": "Monday", "start_mins": 600, "end_mins": 690, "start_time": "10:00", "end_time": "11:30"}]
                },
                {
                    "name": "A2",
                    "faculty": "Teacher B",
                    "slots": [{"day": "Monday", "start_mins": 840, "end_mins": 930, "start_time": "14:00", "end_time": "15:30"}]
                }
            ]
        },
        {
            "course_name": "Course B",
            "sections": [
                {
                    "name": "B1",
                    "faculty": "Teacher C",
                    "slots": [{"day": "Monday", "start_mins": 660, "end_mins": 750, "start_time": "11:00", "end_time": "12:30"}]
                },
                {
                    "name": "B2",
                    "faculty": "Teacher D",
                    "slots": [{"day": "Monday", "start_mins": 840, "end_mins": 930, "start_time": "14:00", "end_time": "15:30"}]
                }
            ]
        }
    ]
    
    schedules = solve_schedules(courses)
    
    # Valid options:
    # 1. Course A: A1, Course B: B2 (no conflict: A1 is 600-690, B2 is 840-930)
    # 2. Course A: A2, Course B: B1 (no conflict: A2 is 840-930, B1 is 660-750)
    # Conflicting options (should be discarded):
    # - A1 and B1 (600-690 and 660-750 overlap)
    # - A2 and B2 (both 840-930 overlap)
    
    assert len(schedules) == 2
    
    # Check that they represent the correct combinations
    names_combinations = [
        {item["course_name"]: item["section"]["name"] for item in comb}
        for comb in schedules
    ]
    
    assert {"Course A": "A1", "Course B": "B2"} in names_combinations
    assert {"Course A": "A2", "Course B": "B1"} in names_combinations
