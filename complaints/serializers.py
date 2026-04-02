from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Complaint, ComplaintVote


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
        )


class ComplaintSerializer(serializers.ModelSerializer):
    complaint_id = serializers.IntegerField(source='id', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    image = serializers.ImageField(required=False, allow_null=True)
    has_upvoted = serializers.SerializerMethodField()

    def get_has_upvoted(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return ComplaintVote.objects.filter(complaint=obj, user=user).exists()

    class Meta:
        model = Complaint
        fields = (
            'id', 'complaint_id', 'title', 'description', 'category', 'image',
            'status', 'upvotes', 'has_upvoted', 'created_by', 'created_by_username', 'created_at',
        )
        read_only_fields = ('id', 'complaint_id', 'created_by', 'status', 'upvotes', 'created_at', 'has_upvoted')


class ComplaintStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Complaint
        fields = ('status',)
