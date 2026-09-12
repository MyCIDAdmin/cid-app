import django_filters

from .models import Notification, TypeNotification


class NotificationFilter(django_filters.FilterSet):
    lu = django_filters.BooleanFilter(field_name="lu")
    type_notification = django_filters.ChoiceFilter(choices=TypeNotification.choices)

    class Meta:
        model = Notification
        fields = ["lu", "type_notification"]
