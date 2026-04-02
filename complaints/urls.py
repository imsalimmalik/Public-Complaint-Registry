from django.urls import path

from .views import (
    ComplaintCreateView,
    ComplaintListView,
    ComplaintPendingListView,
    ComplaintUpvoteView,
    ComplaintStatusUpdateView,
    LoginView,
    LogoutView,
    MeView,
    UserRegistrationView,
)

urlpatterns = [
    path('auth/register/', UserRegistrationView.as_view()),
    path('auth/login/', LoginView.as_view()),
    path('auth/logout/', LogoutView.as_view()),
    path('auth/me/', MeView.as_view()),
    path('create/', ComplaintCreateView.as_view()),
    path('list/', ComplaintListView.as_view()),
    path('pending/', ComplaintPendingListView.as_view()),
    path('vote/<int:pk>/', ComplaintUpvoteView.as_view()),
    path('update/<int:pk>/', ComplaintStatusUpdateView.as_view()),
]
