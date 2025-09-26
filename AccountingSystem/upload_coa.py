import requests

# Path to your updated CSV file
file_path = "updated_CAO_ready_for_import.csv"
url = "http://127.0.0.1:8000/accounts/accounts/upload/"  # ✅ corrected: no double /accounts/

with open(file_path, "rb") as f:
    files = {"file": f}
    response = requests.post(url, files=files)

print("Status Code:", response.status_code)
print("Raw Response Text:", response.text)

