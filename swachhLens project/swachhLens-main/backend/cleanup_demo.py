"""Clean up demo citizens from the database.

Run this once to remove seeded demo users and their reports.
"""
from app.database import execute, query

def cleanup_demo_users():
    """Remove demo citizens and their reports."""

    # List of demo citizen emails to remove
    demo_emails = [
        "vedant.pratap@test.com",
        "ankit.kumar@test.com",
        "riya.singh@test.com",
        "ayush.singh@test.com",
        "shivam.kumar@test.com",
        "neha.sharma@test.com",
    ]

    print("🧹 Cleaning up demo citizens...")

    # Delete reports created by demo users
    for email in demo_emails:
        reports = query("SELECT id FROM reports WHERE reporter = ?", (email,))
        if reports:
            print(f"  Deleting {len(reports)} reports from {email}")
            for report in reports:
                execute("DELETE FROM reports WHERE id = ?", (report["id"],))

    # Delete demo user accounts
    for email in demo_emails:
        user = query("SELECT email, name FROM users WHERE email = ?", (email,))
        if user:
            print(f"  Deleting user account: {email}")
            execute("DELETE FROM users WHERE email = ?", (email,))

    print("✅ Cleanup complete! Demo citizens removed from leaderboard.")

if __name__ == "__main__":
    cleanup_demo_users()
