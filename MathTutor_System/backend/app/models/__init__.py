
"""Import all SQLAlchemy models so metadata is complete for bootstrap and migrations."""

from app.models.chat_session import ChatMessage, ChatSession  # noqa: F401
from app.models.exam import Exam  # noqa: F401
from app.models.mistake import MistakeRecord  # noqa: F401
from app.models.order import Order  # noqa: F401
from app.models.plan import Plan  # noqa: F401
from app.models.question import Question  # noqa: F401
from app.models.question_bank import QuestionBank  # noqa: F401
from app.models.schedule import Schedule  # noqa: F401
from app.models.student import Student  # noqa: F401
from app.models.subscription import Subscription  # noqa: F401
from app.models.subscription_history import SubscriptionHistory  # noqa: F401
from app.models.user import User  # noqa: F401
