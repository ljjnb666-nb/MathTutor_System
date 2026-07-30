"""Read-only Teacher Agent API."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.models.base import get_db
from app.models.user import User
from app.schemas.agent_dto import AgentRunResponse, TeacherAgentRunCreate
from app.services.teacher_agent_service import get_agent_run_or_404, list_agent_runs, run_teacher_agent

router = APIRouter()


@router.post("/runs", response_model=AgentRunResponse)
def create_run(
    request: TeacherAgentRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm_config: LLMConfig = Depends(get_llm_config),
):
    return run_teacher_agent(db, current_user, request, llm_config)


@router.get("/runs", response_model=list[AgentRunResponse])
def list_runs(
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_agent_runs(db, current_user, limit=limit)


@router.get("/runs/{run_id}", response_model=AgentRunResponse)
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_agent_run_or_404(db, current_user, run_id)
