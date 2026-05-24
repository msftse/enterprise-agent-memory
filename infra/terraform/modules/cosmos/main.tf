locals {
  account_name  = "cosmos-${var.base_name}-${var.environment}"
  database_name = "agentmemory"
  container_names = [
    "sessions",
    "observations",
    "memories",
    "graph-nodes",
    "graph-edges",
    "audit-entries",
  ]
}

resource "azurerm_cosmosdb_account" "this" {
  name                = local.account_name
  location            = var.location
  resource_group_name = var.resource_group_name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
  tags                = var.tags

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = var.location
    failover_priority = 0
    zone_redundant    = false
  }

  capabilities {
    name = "EnableServerless"
  }
}

resource "azurerm_cosmosdb_sql_database" "this" {
  name                = local.database_name
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.this.name
}

resource "azurerm_cosmosdb_sql_container" "containers" {
  for_each = toset(local.container_names)

  name                = each.value
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.this.name
  database_name       = azurerm_cosmosdb_sql_database.this.name
  partition_key_paths = ["/tenantId"]
}
