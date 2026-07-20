import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

def send_verification_email(to_email: str, token: str):
    verify_link = f"http://localhost:5173/verify-email?token={token}"

    message = MIMEMultipart("alternative")
    message["Subject"] = "Verify your DataWeaver AI account"
    message["From"] = f"DataWeaver AI <{settings.gmail_address}>"
    message["To"] = to_email

    html_content = f"""
        <p>Welcome to DataWeaver AI!</p>
        <p>Please click the link below to verify your email:</p>
        <p><a href="{verify_link}">{verify_link}</a></p>
        <p>This link expires in 24 hours.</p>
    """
    message.attach(MIMEText(html_content, "html"))

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(settings.gmail_address, settings.gmail_app_password)
        server.sendmail(settings.gmail_address, to_email, message.as_string())