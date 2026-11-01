# Azure Deployment Plan

> **Status:** Validated

Generated: 2026-10-25
Updated: 2026-10-31

---

## 1. Project Overview

**Goal:** Deploy the existing Río Claro customer-service portal to the existing Linux Azure App Service, use Node.js 22 LTS, and authenticate to the existing Azure AI Foundry project with system-assigned managed identity and the least-privilege Foundry user role.

**Path:** Modernize Existing

**Workspace:** Existing React/Vite frontend plus Express/TypeScript API. Build output is `dist/client` and `dist/server`; application data is read from `Datos/`.

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | Development / demonstration |
| Scale | Small (<1K users) |
| Budget | Reuse existing App Service plan; no SKU change or additional compute planned |
| Subscription | Azure for Students (`0714cc8b-3867-49f4-a999-706f2f66d84c`) |
| Location | `westus3`; requested by user |
| Resource group | `RG-RioClaro-AI901`; requested by user |
| Compliance | No additional requirements specified; demo app docs state customer authentication is not included |

## Policy Constraints

- `westus3` is allowed by the subscription-level `Allowed resource deployment regions` policy.
- No policy assignments were found directly at resource group `RG-RioClaro-AI901`.

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| Customer portal | Web frontend | React 19, TypeScript, Vite | `src/` |
| Application API | Web API | Express 5, Node.js 22 | `server/` |
| Demo data | Local JSON data | JSON files | `Datos/` |
| Azure AI Foundry integration | Managed Azure dependency | `@azure/ai-projects`, `@azure/identity` | `server/services/foundry.ts` |

## 4. Recipe Selection

**Selected:** Bicep + Azure CLI for application package deployment

**Rationale:** The target App Service and Foundry resources already exist. Bicep manages the App Service runtime, system-assigned identity, and project-scoped Foundry User role assignment without creating replacement services. Azure CLI deploys the app package. Each PowerShell/Azure CLI command will be shown before execution.

## 5. Architecture

**Stack:** App Service

### Service Mapping

| Component | Azure Service | SKU |
|-----------|---------------|-----|
| Frontend + Express API | Existing Linux App Service `rioclaro-atencion-clientes` | Reuse current plan `planes-crud-Linux` in `RG-CRUD-Practica` (Basic B1); no SKU change |
| Foundry agent | Existing resource `rioclaro-ai901-resource` | Existing |

### Supporting Services

| Service | Purpose |
|---------|---------|
| System-assigned managed identity | App Service access to Foundry without an application key |
| Azure RBAC role at the narrowest supported Foundry project/resource scope | Grant the Foundry user/inference permission after confirming the exact built-in role and scope |

### Deployment Details

- Set the existing App Service Linux runtime to Node.js 22 LTS and enable system-assigned identity through Bicep.
- Existing read-only inspection: the site is running in `West US 3`, currently `NODE|24-lts`, and is linked to App Service Plan `planes-crud-Linux` in `RG-CRUD-Practica`; no plan SKU change is included.
- The existing B1 plan is in `West US 3`; deployment will reuse it without scaling.
- Build the frontend and TypeScript server; publish `dist/client`, `dist/server`, runtime dependencies, and `Datos/`.
- Start with the existing `npm start` script (`node dist/server/index.js`).
- Configure only non-secret Foundry settings in App Service application settings: `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_AGENT_NAME`.
- During deployment, add `NODE_ENV=production`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, and `NPM_CONFIG_PRODUCTION=false` through an additive App Service settings update. Preserve all existing settings; `NODE_ENV` is required for the application to select managed identity, and Oryx needs development dependencies to compile the project.
- The current App Service has an `AZURE_FOUNDRY_API_KEY` setting. Its value will not be read, copied, or included in the package; use managed identity for Foundry calls. Rotating/removing this existing key is a separate, user-confirmed security operation.
- Do not publish `.env`. The server uses `DefaultAzureCredential` locally and `ManagedIdentityCredential` in App Service production.
- Verify `/`, `/api/health`, `/api/products`, and an authenticated Foundry request after deployment.
- The public App Service hostname observed during deployment preparation is `rioclaro-atencion-clientes-ewg8d0dfb8btescy.westus3-01.azurewebsites.net`. Confirm the live hostname again after publishing; the public portal URL uses HTTPS.
- A `.github` directory or GitHub Actions workflow is not a prerequisite for this direct Bicep + Azure CLI deployment.

### Public Deployment Procedure

The App Service deployment requirement was part of the approved scope. Execute these steps in order, preserving all existing application settings and secrets:

1. Apply `infra/main.bicep` and `infra/main.parameters.json` to the existing resource group. This sets Node.js 22, enables system-assigned managed identity, and grants `Foundry User` at the Foundry project scope.
2. Verify that the App Service now has a system-assigned identity and that the project role assignment targets its principal. Stop if the identity is absent.
3. Add/update only `NODE_ENV=production`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, and `NPM_CONFIG_PRODUCTION=false` using the App Service app-settings merge operation. The last setting keeps the build tools in `devDependencies` available to Oryx while it builds the included frontend/server output. Preserve the existing Foundry endpoint/agent settings and all unrelated settings; never read or print `AZURE_FOUNDRY_API_KEY`.
4. Regenerate and inspect `.azure/appservice-deploy.zip` with `scripts/package-appservice.ps1`. Ensure ZIP entry paths use `/` separators so Oryx can find `server/*.ts` on Linux. Deploy it to the existing app using ZIP deployment; do not create a replacement App Service or plan.
5. Verify the public root, `/api/health`, and `/api/products`; then verify the Foundry chat with managed identity after role propagation.

Expected public endpoint (verify after deployment): `https://rioclaro-atencion-clientes-ewg8d0dfb8btescy.westus3-01.azurewebsites.net`.

Deployment finding: the first ZIP was created by Windows `Compress-Archive`, which stored backslashes in ZIP entry names. Oryx then failed to find `server/*.ts`. `scripts/package-appservice.ps1` now writes POSIX entry paths and creates its temporary ZIP outside the workspace (so local Vite watchers do not inspect an in-progress archive). The corrected ZIP deployment completed successfully.

## 6. Provisioning Limit Checklist

### Phase 1: Prepare Resource Inventory

| Resource Type | Number to Deploy | Total After Deployment | Limit/Quota | Notes |
|---------------|------------------|------------------------|-------------|-------|
| Microsoft.Web/sites (existing App Service; no new site) | 0 new | 1 existing | Not applicable to this change | Reuse `rioclaro-atencion-clientes` |
| Existing Azure AI Foundry resource/project | 0 new | 1 existing | Not applicable to this change | Reuse `rioclaro-ai901-resource` |
| Microsoft.Authorization/roleAssignments | 1 planned assignment | 1 planned assignment | No regional compute quota | Assign confirmed Foundry user role to the App Service identity |

### Phase 2: Fetch Quotas and Validate Capacity

No new compute, storage, network, or AI resources are planned. Capacity/quota validation for new resource provisioning is therefore not applicable. Before any changes, verify the existing App Service plan/runtime and Foundry identity/RBAC scope.

**Status:** No new service capacity required. Plan assumes updates to the named existing App Service and Foundry resources only.

## 7. Execution Checklist

### Phase 1: Planning
- [x] Analyze workspace at a high level
- [x] Gather requested target region, resource group, App Service, and Foundry resource
- [x] Confirm active subscription, workload classification, scale, and budget through plan approval
- [x] Inspect existing App Service configuration
- [x] Inspect Foundry account and project role scope
- [x] Prepare resource inventory; no new compute/service resources planned
- [x] Scan deployment inputs and confirm package allowlist
- [x] Select Bicep for resource configuration and Azure CLI for app package deployment
- [x] User approved the plan

### Phase 2: Execution
- [x] Research App Service and Foundry managed-identity role/scope requirements
- [x] Set/verify Node.js 22 LTS and safe App Service settings
- [x] Enable system-assigned identity
- [x] Assign confirmed least-privilege Foundry user role
- [x] Build and deploy application package without `.env`
- [x] Smoke-test deployed routes and Foundry chat using managed identity

### Phase 3: Validation
- [x] Invoke azure-validate skill
- [x] Validate Bicep against `RG-RioClaro-AI901` and review what-if; no deletes
- [x] Validate subscription policy constraints; `westus3` is allowed
- [x] Verify the role assignment is project-scoped and uses Foundry User
- [x] Re-run typecheck, tests, production build, and deployment ZIP exclusion checks
- [x] Record validation proof

Recipe validation steps:
1. Run `references/recipes/scripts/validate-deployment.ps1` for group scope `RG-RioClaro-AI901`, using `infra/main.bicep`, `infra/main.parameters.json`, and the confirmed subscription.
2. Inspect the full what-if output; it reports one project-scoped Foundry User role assignment, Node 24-to-22, no deletes, and six ignored resources. It also reports two `siteConfig` defaults whose current values were independently confirmed (`localMySqlEnabled=false`, `netFrameworkVersion=v4.0`).
3. Retrieve subscription policy assignments and confirm `westus3` is allowed. The Azure Policy MCP tool was not exposed in this session, so the assignments were read with Azure CLI instead.
4. Statically verify the Bicep principal, `Foundry User` role definition ID, and project-only scope.
5. Confirm build/test pass and verify the deployment ZIP contains required server/data files, POSIX paths, and no `.env` or `node_modules`.

Validation note: the App Service had no identity before deployment, and the what-if did not show the identity delta. The Bicep deployment completed successfully; the system-assigned principal was then verified live, and its project-scoped Foundry User assignment was confirmed before publishing.

### Portal update validation (2026-10-31 local time)
- [x] Run `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build`.
- [x] Verify tracking by folio succeeds without an email and returns only tracking fields; verify an unknown folio is not found.
- [x] Verify `/api/health` exposes only application status and the home page source contains no “Servicios digitales” section.
- [x] Package the application and verify required files, POSIX archive paths, exclusion of `.env`/`node_modules`, and no stale client bundles containing the removed section.
- [x] Run Azure pre-deployment validation and review the Bicep what-if; it shows no deletes. This is an application-only deployment; do not apply infrastructure changes.
- [x] Deploy the ZIP to the existing App Service and smoke-test the public home page, health endpoint, and folio lookup.

Portal update validation evidence (2026-10-31):
- `npm.cmd run typecheck`: pass.
- `npm.cmd test`: 5 tests passed, including folio-only order lookup and customer-ID omission.
- `npm.cmd run build`: pass; Vite cleans `dist/client` while retaining the sibling `dist/server`.
- Local API smoke test on port 3301: health returns only `{ "status": "ok" }`; `/api/orders/PED-1001` succeeds without an email and omits `clienteId`; unknown folio returns 404.
- `scripts/package-appservice.ps1 -OutputPath .azure\appservice-deploy.zip`: pass; 29 entries, required app/data files present, POSIX entry paths, no `.env`, `node_modules`, or stale “Servicios digitales” bundle.
- Azure Bicep core validation: pass. Full what-if reviewed: no deletes; output reports two existing-resource modifications (role-assignment reference and App Service default properties) and ignored resources. No infrastructure changes will be applied for this app-only update.
- Existing App Service verified Running in `RG-RioClaro-AI901`, hostname `rioclaro-atencion-clientes-ewg8d0dfb8btescy.westus3-01.azurewebsites.net`. It was Stopped before this update and was started to deploy and verify the site.
- ZIP deployment completed; Azure reported the deployment record as successful. Public checks on 2026-11-01 UTC: `/api/health` returned `{"status":"ok"}` and `/api/orders/PED-1001` returned tracking fields without email or `clienteId`.
- Deployment caveat: older JavaScript bundle URLs remained publicly accessible after the ZIP deployment. Cleaning/replacing the existing deployment directory with `--clean true` was offered to the user and declined, so removal of all previous static assets is not verified. Do not claim that every copy of prior client content has been removed.

### Phase 4: Deployment
- [x] Invoke azure-deploy skill after validation
- [x] Deploy the existing App Service configuration and application ZIP
- [x] Verify public routes and Foundry access using managed identity

## 8. Validation Proof

| Check | Command Run | Result | Timestamp |
|-------|-------------|--------|-----------|
| Typecheck | `npm.cmd run typecheck` | ✅ Pass | 2026-10-25 23:41 |
| Unit tests | `npm.cmd test` | ✅ 4 tests passed | 2026-10-25 23:41 |
| Production build | `npm.cmd run build` | ✅ Pass | 2026-10-25 23:41 |
| Package contents | `scripts/package-appservice.ps1` and ZIP entry checks | ✅ Pass, 35 entries; server/data present, no `.env` or `node_modules` | 2026-10-25 23:42 |
| Azure core validation | `validate-deployment.ps1 -Scope group -ResourceGroup RG-RioClaro-AI901 -Template .\infra\main.bicep -Parameters .\infra\main.parameters.json -Subscription 0714cc8b-3867-49f4-a999-706f2f66d84c` | ✅ Bicep compile, group validation, and what-if completed | 2026-10-25 23:45 |
| Full what-if review | `az deployment group what-if ... --result-format FullResourcePayloads` | ✅ 1 role assignment create, 1 App Service modify (Node 24 → 22), 0 deletes, 6 ignored. The two reported defaults match current Azure values; the App Insights tag is preserved. Identity delta was not shown. | 2026-10-25 23:46 |
| Policy assignments | `az policy assignment list --scope /subscriptions/0714cc8b-3867-49f4-a999-706f2f66d84c` | ✅ `westus3` is allowed; ASC default policy set also assigned | 2026-10-25 23:40 |
| Static RBAC | Bicep review; `az role definition list --name 53ca6127-db72-4b80-b1b0-d745d6d5456d` | ✅ Foundry User; App Service system identity; assignment scope is the Foundry project | 2026-10-25 23:42 |
| Existing settings and identity before deployment | `az webapp config appsettings list ... --query [].name`; `az webapp identity show ...` | ✅ No setting values exposed. `NODE_ENV` and managed identity were absent before deployment. | 2026-10-25 23:45 |

**Validated by:** azure-validate workflow
**Validation timestamp:** 2026-10-25 23:46

## 9. Deployment Results

| Check | Result | Timestamp (UTC) |
|-------|--------|-----------------|
| Bicep infrastructure deployment | ✅ Succeeded; Node 22, system-assigned identity, Foundry User role assignment | 2026-10-27 01:07 |
| Live identity and role verification | ✅ Principal `276d7e5c-4332-44a9-b432-7266ae457c47`; Foundry User at project scope | 2026-10-27 01:08 |
| ZIP deployment | ✅ Succeeded with POSIX archive paths; Oryx build and app startup completed | 2026-10-27 01:21 |
| Public application routes | ✅ `/` HTTP 200; `/api/health` `ok`, Foundry configured; `/api/products` returns 5 products | 2026-10-27 01:24 |
| Foundry chat | ✅ Public `/api/chat` returned a response using production managed identity | 2026-10-27 01:24 |
| Startup diagnostics | ✅ Application and container filesystem logging enabled after initial startup failure | 2026-10-27 01:23 |
| Portal update ZIP deployment | ✅ Deployment record completed; public health and folio-only order lookup passed. Legacy bundle URLs still returned JavaScript; deployment-directory cleanup was declined and remains outstanding. | 2026-11-01 01:31 |

**Public portal:** https://rioclaro-atencion-clientes-ewg8d0dfb8btescy.westus3-01.azurewebsites.net

## 10. Files to Generate

| File | Purpose | Status |
|------|---------|--------|
| `.azure/deployment-plan.md` | Deployment source of truth and validation/deployment proof | Validated and deployed |
| `infra/main.bicep` | Existing App Service runtime/identity and Foundry project RBAC | Deployed |
| `infra/main.parameters.json` | Non-secret deployment parameters | Applied |
| `scripts/package-appservice.ps1` | Creates POSIX-path ZIP without `.env`/`node_modules` | Verified |
| `.azure/appservice-deploy.zip` | App Service build/package; excludes `.env` | Deployed |

## 11. Next Steps

> Current: Portal deployed and publicly verified

1. Use the public HTTPS portal URL above.
2. Keep the existing App Service settings and system-assigned identity intact.

## Approval
Approved by user on 2026-10-25.
