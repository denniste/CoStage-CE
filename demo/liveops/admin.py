from django.contrib import admin

from .models import BizUser, DecisionLog

admin.site.register(BizUser)
admin.site.register(DecisionLog)
