use super::types::{
    ProviderCommandError, ProviderErrorKind, ProviderSecretDiagnosis, ProviderSecretInput,
    ProviderSecretStatus,
};
use keyring::{Entry, Error as KeyringError};

const PROVIDER_SECRET_SERVICE: &str = "io.github.fouri7.pilotbell.provider";

fn validate_secret_input(input: &ProviderSecretInput) -> Result<(), ProviderCommandError> {
    if input.provider_id.trim().is_empty() {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider id is missing.",
            false,
        ));
    }

    if input.api_key.trim().is_empty() {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "API key is required.",
            false,
        ));
    }

    Ok(())
}

fn provider_secret_entry(provider_id: &str) -> Result<Entry, ProviderCommandError> {
    Entry::new(PROVIDER_SECRET_SERVICE, provider_id).map_err(|error| {
        ProviderCommandError::new(
            ProviderErrorKind::SecretStore,
            format!("Failed to access the OS credential store: {error}"),
            false,
        )
    })
}

pub(super) fn read_provider_secret(provider_id: &str) -> Result<String, ProviderCommandError> {
    provider_secret_entry(provider_id)?
        .get_password()
        .map_err(|error| match error {
            KeyringError::NoEntry => ProviderCommandError::new(
                ProviderErrorKind::Validation,
                "Provider secret is missing. Re-enter the API key and save the provider again.",
                false,
            ),
            other => ProviderCommandError::new(
                ProviderErrorKind::SecretStore,
                format!("Failed to read provider secret: {other}"),
                false,
            ),
        })
}

pub(super) fn store_secret(
    input: &ProviderSecretInput,
) -> Result<ProviderSecretStatus, ProviderCommandError> {
    validate_secret_input(input)?;
    provider_secret_entry(&input.provider_id)?
        .set_password(input.api_key.trim())
        .map_err(|error| {
            ProviderCommandError::new(
                ProviderErrorKind::SecretStore,
                format!("Failed to store provider secret: {error}"),
                false,
            )
        })?;

    Ok(ProviderSecretStatus {
        provider_id: input.provider_id.clone(),
        message: "Provider secret saved to the OS credential store.".into(),
    })
}

pub(super) fn diagnose_secret(
    provider_id: &str,
) -> Result<ProviderSecretDiagnosis, ProviderCommandError> {
    let trimmed = provider_id.trim();
    if trimmed.is_empty() {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider id is missing.",
            false,
        ));
    }

    match provider_secret_entry(trimmed) {
        Ok(entry) => match entry.get_password() {
            Ok(secret) if !secret.trim().is_empty() => Ok(ProviderSecretDiagnosis {
                provider_id: trimmed.into(),
                has_secret: true,
                message: "Provider secret exists in the OS credential store.".into(),
            }),
            Ok(_) | Err(KeyringError::NoEntry) => Ok(ProviderSecretDiagnosis {
                provider_id: trimmed.into(),
                has_secret: false,
                message:
                    "Provider metadata exists, but no secret was found in the OS credential store."
                        .into(),
            }),
            Err(error) => Err(ProviderCommandError::new(
                ProviderErrorKind::SecretStore,
                format!("Failed to diagnose provider secret: {error}"),
                false,
            )),
        },
        Err(error) => Err(error),
    }
}

pub(super) fn delete_secret(
    provider_id: &str,
) -> Result<ProviderSecretStatus, ProviderCommandError> {
    let trimmed = provider_id.trim();
    if trimmed.is_empty() {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider id is missing.",
            false,
        ));
    }

    match provider_secret_entry(trimmed) {
        Ok(entry) => match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(ProviderSecretStatus {
                provider_id: provider_id.into(),
                message: "Provider secret removed from the OS credential store.".into(),
            }),
            Err(error) => Err(ProviderCommandError::new(
                ProviderErrorKind::SecretStore,
                format!("Failed to remove provider secret: {error}"),
                false,
            )),
        },
        Err(error) => Err(error),
    }
}
