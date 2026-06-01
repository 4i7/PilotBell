use super::adapters::{call_provider, validate_provider};
use super::secrets::{delete_secret, diagnose_secret, store_secret};
use super::types::{
    AssistantReply, ProviderCommandResult, ProviderConfig, ProviderHealth, ProviderSecretDiagnosis,
    ProviderSecretInput, ProviderSecretStatus,
};

#[tauri::command]
pub(crate) async fn store_provider_secret(
    input: ProviderSecretInput,
) -> ProviderCommandResult<ProviderSecretStatus> {
    match store_secret(&input) {
        Ok(status) => ProviderCommandResult::Success { data: status },
        Err(error) => ProviderCommandResult::Error { error },
    }
}

#[tauri::command]
pub(crate) async fn diagnose_provider_secret(
    provider_id: String,
) -> ProviderCommandResult<ProviderSecretDiagnosis> {
    match diagnose_secret(&provider_id) {
        Ok(status) => ProviderCommandResult::Success { data: status },
        Err(error) => ProviderCommandResult::Error { error },
    }
}

#[tauri::command]
pub(crate) async fn delete_provider_secret(
    provider_id: String,
) -> ProviderCommandResult<ProviderSecretStatus> {
    match delete_secret(&provider_id) {
        Ok(status) => ProviderCommandResult::Success { data: status },
        Err(error) => ProviderCommandResult::Error { error },
    }
}

#[tauri::command]
pub(crate) async fn test_provider(
    provider: ProviderConfig,
) -> ProviderCommandResult<ProviderHealth> {
    let result = match validate_provider(&provider) {
        Ok(adapter) => call_provider(adapter.healthcheck_prompt, provider.clone(), adapter).await,
        Err(error) => Err(error),
    };

    match result {
        Ok(_) => ProviderCommandResult::Success {
            data: ProviderHealth {
                message: format!(
                    "Provider test succeeded for {} / {}.",
                    provider.name, provider.model
                ),
            },
        },
        Err(error) => ProviderCommandResult::Error { error },
    }
}

#[tauri::command]
pub(crate) async fn handle_prompt(
    prompt: String,
    provider: ProviderConfig,
) -> ProviderCommandResult<AssistantReply> {
    let result = match validate_provider(&provider) {
        Ok(adapter) => call_provider(&prompt, provider, adapter).await,
        Err(error) => Err(error),
    };

    match result {
        Ok(reply) => ProviderCommandResult::Success { data: reply },
        Err(error) => ProviderCommandResult::Error { error },
    }
}
