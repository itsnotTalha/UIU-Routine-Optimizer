import pytest
from backend.parser import parse_section_text, parse_time_to_minutes

def test_parse_time_to_minutes():
    assert parse_time_to_minutes("00:00") == 0
    assert parse_time_to_minutes("12:30") == 750
    assert parse_time_to_minutes("23:59") == 1439
    
    with pytest.raises(ValueError):
        parse_time_to_minutes("24:00")
    with pytest.raises(ValueError):
        parse_time_to_minutes("12:60")
    with pytest.raises(ValueError):
        parse_time_to_minutes("abc")

def test_parse_single_section():
    raw = """
    K
    Muhammad Sibgatullah Zunnun
    Sunday 12:31-13:50
    Wednesday 12:31-13:50
    """
    sections = parse_section_text(raw)
    assert len(sections) == 1
    sec = sections[0]
    assert sec["name"] == "K"
    assert sec["faculty"] == "Muhammad Sibgatullah Zunnun"
    assert len(sec["slots"]) == 2
    assert sec["slots"][0] == {
        "day": "Sunday",
        "start_time": "12:31",
        "end_time": "13:50",
        "start_mins": 751,
        "end_mins": 830
    }

def test_parse_multiple_sections():
    raw = """
    K
    Faculty A
    Monday 09:30-10:50
    
    L
    Faculty B
    Tuesday 11:00-12:20
    Thursday 11:00-12:20
    """
    sections = parse_section_text(raw)
    assert len(sections) == 2
    assert sections[0]["name"] == "K"
    assert sections[0]["faculty"] == "Faculty A"
    assert len(sections[0]["slots"]) == 1
    
    assert sections[1]["name"] == "L"
    assert sections[1]["faculty"] == "Faculty B"
    assert len(sections[1]["slots"]) == 2

def test_parse_optional_room_information():
    raw = """
    K
    Muhammad Sibgatullah Zunnun
    Room 203
    Sunday 12:31-13:50
    """
    sections = parse_section_text(raw)
    assert len(sections) == 1
    sec = sections[0]
    assert sec["room"] == "Room 203"

def test_parse_abbreviations_and_casing():
    raw = """
    A
    Teacher
    sun 08:30-09:30
    Mon 10:00-11:00
    """
    sections = parse_section_text(raw)
    assert len(sections) == 1
    slots = sections[0]["slots"]
    assert slots[0]["day"] == "Sunday"
    assert slots[1]["day"] == "Monday"

def test_invalid_formats():
    # Empty
    with pytest.raises(ValueError):
        parse_section_text("")
    
    # Missing slots
    with pytest.raises(ValueError):
        parse_section_text("K\nFaculty Name")
        
    # Invalid day
    with pytest.raises(ValueError):
        parse_section_text("K\nFaculty Name\nInvalidDay 10:00-11:00")
        
    # Start time after end time
    with pytest.raises(ValueError):
        parse_section_text("K\nFaculty Name\nMonday 11:00-10:00")

    # Too many non-slot lines after optional room info
    with pytest.raises(ValueError):
        parse_section_text("K\nFaculty Name\nRoom 203\nLab 1\nMonday 11:00-12:00")
