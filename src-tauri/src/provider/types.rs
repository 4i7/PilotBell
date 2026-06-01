use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub(crate) struct AssistantReply {
    pub(super) content: String,
    pub(super) provider: String,
    pub(super) model: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderConfig {
    pub(super) id: String,
    pub(super) kind: String,
    pub(super) name: String,
    pub(super) endpoint: String,
    pub(super) model: String,
    pub(super) has_secret: bool,
    #[serde(default)]
    pub(super) advanced_endpoint: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderSecretInput {
    pub(super) provider_id: String,
    pub(super) api_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum ProviderErrorKind {
    Validation,
    SecretStore,
    Timeout,
    Network,
    Provider,
    ResponseFormat,
    Internal,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderCommandError {
    pub(super) kind: ProviderErrorKind,
    pub(super) message: String,
    pub(super) status_code: Option<u16>,
    pub(super) retryable: bool,
    pub(super) details: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct ProviderHealth {
    pub(super) message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderSecretStatus {
    pub(super) provider_id: String,
    pub(super) message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderSecretDiagnosis {
    pub(super) provider_id: String,
    pub(super) has_secret: bool,
    pub(super) message: String,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub(crate) enum ProviderCommandResult<T> {
    Success { data: T },
    Error { error: ProviderCommandError },
}

impl ProviderCommandError {
    pub(super) fn new(
        kind: ProviderErrorKind,
        message: impl Into<String>,
        retryable: bool,
    ) -> ProviderCommandError {
        ProviderCommandError {
            kind,
            message: message.into(),
            status_code: None,
            retryable,
            details: None,
        }
    }

    pub(super) fn with_status(mut self, status_code: u16) -> ProviderCommandError {
        self.status_code = Some(status_code);
        self
    }

    pub(super) fn with_details(mut self, details: impl Into<String>) -> ProviderCommandError {
        let details = details.into();
        if !details.trim().is_empty() {
            self.details = Some(details);
        }
        self
    }
}
