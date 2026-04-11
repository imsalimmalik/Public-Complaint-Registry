import boto3
import os
def send_sns_notification(message):
    client = boto3.client('sns', region_name='us-east-1')

    response = client.publish(
        TopicArn=os.getenv("TopicArn"),
        Message=message,
        Subject='New Complaint Alert'
    )

    return response