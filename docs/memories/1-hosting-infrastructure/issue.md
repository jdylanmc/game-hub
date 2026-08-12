# Issue #1: Hosting Infrastructure

- URL: https://github.com/jdylanmc/game-hub/issues/1
- Labels: `type:non-functional`, `area:website`, `priority:P0`
- Branch: `ralph/issue-1-hosting-infrastructure`

## Body

## Goal

Create the foundational Azure hosting infrastructure for Game Hub using Bicep so environments can be deployed consistently and repeatably.

## Requirements

- Define and organize all required Azure resources using Bicep modules.
- Host the frontend as a static website.
- Support user authentication for the website.
- Host the API-driven backend from a Docker container image.
- Provision blob storage for game assets, user-facing media, and other static assets.
- Place an appropriate content delivery layer in front of blob-hosted assets.
- Include protection against bots and abusive automated traffic.
- Keep configuration environment-aware and suitable for future development and production deployments.
- Expose required resource outputs for application deployment and configuration.

## Acceptance Criteria

- A documented Bicep deployment provisions the complete baseline hosting stack in Azure.
- The static frontend can be deployed and reached through its public endpoint.
- The containerized API can be deployed and reached by the frontend through a stable endpoint.
- Authentication can be enabled without redesigning the hosting topology.
- Assets can be uploaded to blob storage and served through the content delivery endpoint.
- Bot protection is applied at the public ingress layer.
- Secrets are not committed to source control and are supplied through an appropriate secure configuration mechanism.
- Resource naming, regions, environment parameters, and outputs are documented.
- The deployment is repeatable and does not require manually creating resources in the Azure portal.

## Open Design Decisions

- Final static hosting service and authentication integration.
- Container hosting and container registry services.
- Content delivery network/front-door topology and caching policy.
- Bot protection, web application firewall, and rate-limiting approach.
- Environment strategy, observability, scaling, and cost controls.
