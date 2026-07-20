import smtplib
from email.mime.text import MIMEText
from app.config import settings

message = MIMEText("<p>Test email from DataWeaver AI via Gmail SMTP!</p>", "html")
message["Subject"] = "DataWeaver AI - SMTP Test"
message["From"] = settings.gmail_address
message["To"] = "keerthanathomas097@gmail.com"

with smtplib.SMTP("smtp.gmail.com", 587) as server:
    server.starttls()
    server.login(settings.gmail_address, settings.gmail_app_password)
    server.sendmail(settings.gmail_address, message["To"], message.as_string())

print("Sent successfully!")