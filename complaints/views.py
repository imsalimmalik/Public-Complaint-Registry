from django.contrib.auth.models import User
from django.db.models import F
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db import transaction
from .dynamodb import table, votes_table
from django.core.files.storage import default_storage

from .models import Complaint, ComplaintVote
from .permissions import IsSuperUser
from .serializers import (
    ComplaintSerializer,
    ComplaintStatusSerializer,
    UserRegistrationSerializer,
)


class UserRegistrationView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                'token': token.key,
                'username': user.username,
                'is_superuser': user.is_superuser,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code != 200:
            return response
        token = Token.objects.get(key=response.data['token'])
        user = token.user
        return Response({
            'token': token.key,
            'username': user.username,
            'is_superuser': user.is_superuser,
        })


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({
            'username': request.user.username,
            'is_superuser': request.user.is_superuser,
        })


class ComplaintCreateView(generics.CreateAPIView):
    queryset = Complaint.objects.all()
    serializer_class = ComplaintSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        complaint = serializer.save(created_by=self.request.user)

        # Sync with DynamoDB
        try:
            item = {
                "complaint_id": str(complaint.id),
                "title": complaint.title,
                "description": complaint.description,
                "category": complaint.category,
                "status": complaint.status,
                "upvotes": complaint.upvotes,
                "created_by": complaint.created_by.username,
                "created_at": complaint.created_at.isoformat()
            }
            if complaint.image:
                item["image"] = complaint.image.name # Store relative path (e.g. 'complaints/file.jpg')

            table.put_item(Item=item)
        except Exception as e:
            # We log the error but don't fail the request since SQLite save succeeded
            print(f"Error syncing to DynamoDB: {e}")


class ComplaintListView(generics.ListAPIView):
    serializer_class = ComplaintSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Complaint.objects.filter(created_by=self.request.user).order_by('-created_at')


import json
import base64

class ComplaintPendingListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        limit_raw = request.query_params.get('limit', '10')
        last_key_b64 = request.query_params.get('last_key')

        try:
            limit = int(limit_raw)
        except ValueError:
            limit = 10

        scan_kwargs = {
            "Limit": limit,
            "FilterExpression": "#s = :val",
            "ExpressionAttributeNames": {"#s": "status"},
            "ExpressionAttributeValues": {":val": "Pending"}
        }

        if last_key_b64:
            try:
                last_key_json = base64.b64decode(last_key_b64).decode('utf-8')
                scan_kwargs["ExclusiveStartKey"] = json.loads(last_key_json)
            except Exception as e:
                print(f"Error decoding last_key: {e}")

        try:
            response = table.scan(**scan_kwargs)
            items = response.get("Items", [])
            
            # Map keys for frontend and generate fresh S3 URLs
            for item in items:
                # 1. Map IDs for frontend consistency
                if "complaint_id" in item:
                    item["id"] = item["complaint_id"]
                
                # 2. Map username for frontend
                if "created_by" in item:
                    item["created_by_username"] = item["created_by"]

                # 3. Generate fresh signed URL from S3 (Signed URLs expire!)
                img_path = item.get("image")
                if img_path:
                    # 1. If it's a full URL (old format), try to recover the relative path
                    if img_path.startswith("http"):
                        if "/complaints/" in img_path:
                            # Extract the key (e.g., 'complaints/my_photo.jpg') and remove query params
                            img_path = "complaints/" + img_path.split("/complaints/")[1].split("?")[0]

                    # 2. Generate a fresh signed URL from S3
                    if not img_path.startswith("http"):
                        try:
                            item["image"] = default_storage.url(img_path)
                        except Exception as e:
                            print(f"Error generating fresh S3 URL for {img_path}: {e}")

            next_key_b64 = None
            if "LastEvaluatedKey" in response:
                next_key_json = json.dumps(response["LastEvaluatedKey"])
                next_key_b64 = base64.b64encode(next_key_json.encode('utf-8')).decode('utf-8')

            # Convert Decimal objects to int/float for JSON response
            from decimal import Decimal
            def convert_decimal(obj):
                if isinstance(obj, list):
                    return [convert_decimal(i) for i in obj]
                elif isinstance(obj, dict):
                    return {k: convert_decimal(v) for k, v in obj.items()}
                elif isinstance(obj, Decimal):
                    return int(obj) if obj % 1 == 0 else float(obj)
                return obj

            items = convert_decimal(items)

            return Response({
                "results": items,
                "next_key": next_key_b64
            })
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class ComplaintUpvoteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        complaint = get_object_or_404(Complaint, pk=pk)
        user = request.user

        with transaction.atomic():
            vote_qs = ComplaintVote.objects.filter(complaint=complaint, user=user)
            if vote_qs.exists():
                # Remove vote
                vote_qs.delete()
                Complaint.objects.filter(pk=pk).update(upvotes=F('upvotes') - 1)
                voted = False
                message = "Vote removed"
                # DynamoDB sync: Delete vote
                try:
                    votes_table.delete_item(Key={"complaint_id": str(pk), "user_id": user.username})
                except: pass
            else:
                # Add vote
                ComplaintVote.objects.create(complaint=complaint, user=user)
                Complaint.objects.filter(pk=pk).update(upvotes=F('upvotes') + 1)
                voted = True
                message = "Voted"
                # DynamoDB sync: Put vote
                try:
                    votes_table.put_item(Item={"complaint_id": str(pk), "user_id": user.username})
                except: pass

        # Refresh from DB to get the updated upvotes count
        complaint.refresh_from_db()

        # Sync upvotes to DynamoDB
        try:
            table.update_item(
                Key={"complaint_id": str(pk)},
                UpdateExpression="SET upvotes = :val",
                ExpressionAttributeValues={":val": complaint.upvotes}
            )
        except: pass

        return Response({
            "message": message,
            "upvotes": complaint.upvotes,
            "voted": voted
        })


class ComplaintStatusUpdateView(generics.UpdateAPIView):
    queryset = Complaint.objects.all()
    serializer_class = ComplaintStatusSerializer
    permission_classes = [IsSuperUser]

    def perform_update(self, serializer):
        instance = serializer.save()
        # Sync status to DynamoDB
        try:
            table.update_item(
                Key={"complaint_id": str(instance.id)},
                UpdateExpression="SET #s = :val",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":val": instance.status}
            )
        except: pass