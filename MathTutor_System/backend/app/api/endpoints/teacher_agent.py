"""Teacher Agent API."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.models.base import get_db
from app.models.user import User
from app.schemas.agent_dto import AgentRunResponse, TeacherAgentRunCreate
from app.schemas.practice_draft_dto import (
    AgentActionResponse,
    AgentArtifactResponse,
    PracticeDraftConfirm,
    PracticeDraftCreate,
    PracticeDraftUpdate,
    PreparePracticeSaveResponse,
)
from app.services.teacher_agent_service import get_agent_run_or_404, list_agent_runs, run_teacher_agent
from app.services.teacher_agent_artifact_service import (
    cancel_action as cancel_agent_action,
    confirm_action as confirm_agent_action,
    create_practice_artifact,
    get_action_or_404,
    get_artifact_or_404,
    get_practice_draft_generator,
    list_artifact_actions,
    list_run_artifacts,
    prepare_practice_save,
    update_practice_artifact,
)

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


@router.get("/runs/{run_id}/artifacts", response_model=list[AgentArtifactResponse])
def get_run_artifacts(
    run_id: int,
    artifact_type: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_run_artifacts(db, current_user, run_id, artifact_type=artifact_type)


@router.post("/runs/{run_id}/artifacts/practice-set", response_model=AgentArtifactResponse, status_code=201)
async def create_practice_set_artifact(
    run_id: int,
    request: PracticeDraftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm_config: LLMConfig = Depends(get_llm_config),
    generator: object = Depends(get_practice_draft_generator),
):
    return await create_practice_artifact(
        db,
        current_user,
        run_id,
        request,
        llm_config,
        generator=generator,
    )


@router.get("/artifacts/{artifact_id}", response_model=AgentArtifactResponse)
def get_artifact(
    artifact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_artifact_or_404(db, current_user, artifact_id)


@router.get("/artifacts/{artifact_id}/actions", response_model=list[AgentActionResponse])
def get_artifact_actions(
    artifact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_artifact_actions(db, current_user, artifact_id)


@router.patch("/artifacts/{artifact_id}", response_model=AgentArtifactResponse)
def update_artifact(
    artifact_id: int,
    request: PracticeDraftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_practice_artifact(db, current_user, artifact_id, request)


@router.post("/artifacts/{artifact_id}/prepare-save", response_model=PreparePracticeSaveResponse, status_code=201)
def prepare_save(
    artifact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    action, summary = prepare_practice_save(db, current_user, artifact_id)
    return PreparePracticeSaveResponse(action=action, confirmation_summary=summary)


@router.post("/actions/{action_id}/confirm", response_model=AgentActionResponse)
def confirm_action(
    action_id: int,
    request: PracticeDraftConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return confirm_agent_action(db, current_user, action_id, request)


@router.post("/actions/{action_id}/cancel", response_model=AgentActionResponse)
def cancel_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return cancel_agent_action(db, current_user, action_id)


@router.get("/actions/{action_id}", response_model=AgentActionResponse)
def get_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_action_or_404(db, current_user, action_id)
