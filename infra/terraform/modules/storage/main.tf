resource "random_id" "storage" {
  byte_length = 4
}

locals {
  # Storage account names: lowercase, no hyphens, max 24 chars, globally unique
  storage_name = substr(replace("st${var.base_name}${var.environment}${random_id.storage.hex}", "-", ""), 0, 24)
}

resource "azurerm_storage_account" "this" {
  name                            = local.storage_name
  location                        = var.location
  resource_group_name             = var.resource_group_name
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  tags                            = var.tags

  blob_properties {
    delete_retention_policy {
      days = 7
    }
  }
}

resource "azurerm_storage_container" "audit_logs" {
  name                  = "audit-logs"
  storage_account_id    = azurerm_storage_account.this.id
  container_access_type = "private"
}

resource "azurerm_storage_container" "raw_observations" {
  name                  = "raw-observations"
  storage_account_id    = azurerm_storage_account.this.id
  container_access_type = "private"
}
