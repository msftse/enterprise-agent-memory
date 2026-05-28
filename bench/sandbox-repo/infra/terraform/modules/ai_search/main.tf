locals {
  search_name = "search-${var.base_name}-${var.environment}"
  sku         = var.environment == "prod" ? "standard" : "basic"
}

resource "azurerm_search_service" "this" {
  name                         = local.search_name
  location                     = var.location
  resource_group_name          = var.resource_group_name
  sku                          = local.sku
  replica_count                = 1
  partition_count              = 1
  hosting_mode                 = "default"
  local_authentication_enabled = true
  authentication_failure_mode  = "http401WithBearerChallenge"
  tags                         = var.tags
}
