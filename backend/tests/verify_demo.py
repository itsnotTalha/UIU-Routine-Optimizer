import urllib.request
import json

def verify():
    url = "http://127.0.0.1:8000/api/optimize"
    
    # Rich demo data
    demo_payload = {
        "courses": [
            {
                "course_name": "CSE 303 (Database)",
                "raw_text": "A\nDr. Mohammad Kaykobad\nMonday 09:50-11:10\nWednesday 09:50-11:10\n\nB\nDr. Mohammad Kaykobad\nMonday 11:10-12:30\nWednesday 11:10-12:30"
            },
            {
                "course_name": "CSE 305 (Algorithms)",
                "raw_text": "K\nMuhammad Sibgatullah Zunnun\nSunday 12:20-13:40\nWednesday 12:20-13:40\n\nL\nMuhammad Sibgatullah Zunnun\nSunday 13:50-15:10\nWednesday 13:50-15:10"
            },
            {
                "course_name": "CSE 307 (Soft. Eng.)",
                "raw_text": "T1\nJohn Smith\nThursday 11:00-13:30\n\nT2\nJohn Smith\nTuesday 09:50-11:10\nThursday 09:50-11:10"
            }
        ]
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(demo_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    
    try:
        response = urllib.request.urlopen(req)
        res_data = json.loads(response.read().decode())
        schedules = res_data.get("schedules", [])
        
        print("="*60)
        print(f"VERIFICATION SUCCESSFUL: Got {len(schedules)} valid schedules.")
        print("="*60)
        
        for idx, schedule in enumerate(schedules):
            print(f"\nOption {idx + 1}:")
            for item in schedule:
                c_name = item["course_name"]
                sec = item["section"]
                slots_str = ", ".join([f"{s['day']} {s['start_time']}-{s['end_time']}" for s in sec["slots"]])
                print(f"  - {c_name} | Sec {sec['name']} ({sec['faculty']}) | Slots: {slots_str}")
                
            # Double check conflict-free guarantee for this option
            slots_list = []
            for item in schedule:
                for slot in item["section"]["slots"]:
                    slots_list.append(slot)
            
            # Check all pairs for conflicts
            has_conflict = False
            for i in range(len(slots_list)):
                for j in range(i + 1, len(slots_list)):
                    s1 = slots_list[i]
                    s2 = slots_list[j]
                    if s1["day"] == s2["day"]:
                        if s1["start_mins"] < s2["end_mins"] and s2["start_mins"] < s1["end_mins"]:
                            print(f"  [ERROR] Conflict detected in Option {idx + 1} between slots: {s1} and {s2}")
                            has_conflict = True
            
            if not has_conflict:
                print("  [SUCCESS] Conflict-free check passed!")
                
    except Exception as e:
        print(f"Verification Failed: {e}")

if __name__ == "__main__":
    verify()
