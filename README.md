# Notes — a microservice app on Kubernetes

## 1. What it does

A small shared notes board. Users open a web page, add short text notes, see all notes, and delete them.
The page also shows simple statistics (note count, average length) and **which pod served each request**, so you can see load balancing across replicas.

> **Pretend:** the app is tiny and doesn't actually need scaling. Imagine thousands of users (e.g. a company-wide notice board)
> where read traffic is heavy. Then you would scale the stateless `web` and `notes-api` tiers separately.

## 2. Architecture

```
 Browser ──HTTP──▶ [web Service: NodePort 30080]
                        │  load-balances over
                        ▼
                  web pods (x2)        Node.js/Express: serves UI + /api/* REST, calls notes-api
                        │ REST/JSON (ClusterIP "notes-api")
                        ▼
                  notes-api pods (x2)  Node.js/Express: CRUD REST API over MongoDB
                        │ MongoDB wire protocol (ClusterIP "mongo")
                        ▼
                  mongo pod (x1) ──▶ PersistentVolumeClaim (1Gi)
```

| Component | Microservice / K8s object | Responsibility | REST API |
|---|---|---|---|
| UI + API gateway | `web` (Deployment + NodePort Service) | Serves the HTML/JS UI. Exposes `/api/*` to the browser and forwards to notes-api. Computes `/api/stats` from notes-api data. | `GET/POST /api/notes`, `DELETE /api/notes/{id}`, `GET /api/stats`, `GET /health` |
| Notes service | `notes-api` (Deployment + ClusterIP Service) | Owns the notes data: validation, storage and retrieval in MongoDB. | `GET/POST /notes`, `DELETE /notes/{id}`, `GET /health` |
| Database | `mongo` (Deployment, 1 replica, PVC, ClusterIP) | Stores notes durably. | (MongoDB protocol) |
| Config/secrets | `mongo-secret` (Secret) | DB credentials, passed to mongo and notes-api as env vars. | — |

**Patterns and principles used**
- **Microservices / single responsibility:** UI/gateway and data service are separate, independently deployed and scaled.
- **API Gateway / Backend-for-Frontend:** `web` is the only public entry point. The browser never talks to notes-api or Mongo directly.
- **Database-per-service:** only `notes-api` can access MongoDB.
- **Stateless services + horizontal scaling:** web and notes-api keep no local state, so `kubectl scale` works on each independently.
- **Service discovery & load balancing:** Kubernetes Services (DNS names `notes-api`, `mongo`) spread traffic across pods.
- **Health endpoint monitoring:** `/health` + readiness probes, so traffic only goes to ready pods.
- **Externalized configuration:** URLs and credentials come from env vars/Secrets, not from code.
- **Persistent storage:** a PVC keeps Mongo data across pod, deployment and cluster restarts.

## 3. Benefits, challenges, security

**Benefits**
- Each tier scales independently (e.g. 5 web, 2 notes-api) to match load. This saves cost compared with scaling a monolith.
- Failure isolation: if notes-api is down, web still serves the page and returns a clear `503`.
- Rolling updates per service mean deployments have no downtime.
- Each team/service can be changed or rewritten separately as long as the REST contract holds.

**Challenges and mitigations**
| Challenge | Mitigation (done / possible) |
|---|---|
| Extra network hop, latency, partial failures | Done: 3s timeouts + 503 on failure. Possible: retries, circuit breaker. |
| Database is a single point of failure and not scalable | Done: PVC for durability, `Recreate` strategy to avoid two writers. Possible: MongoDB replica set via StatefulSet, or a managed DB (Atlas). |
| Harder debugging across services | Done: access logs to stdout (`kubectl logs`), `X-Served-By` headers. Possible: central logging (Loki/ELK), tracing (OpenTelemetry). |
| Manual scaling | Possible: HorizontalPodAutoscaler (CPU requests/limits are already set). |
| More operational complexity | Everything is declared in one manifest, `k8s/app.yaml`. Possible: Helm/Kustomize, CI/CD pipeline. |

**Security**
| Issue | Mitigation |
|---|---|
| Exposed attack surface | Done: only `web` is exposed (NodePort). `notes-api` and `mongo` are ClusterIP only, so they can't be reached from outside. |
| DB credentials | Done: Mongo auth is enabled, and credentials come from a Kubernetes Secret, not from code. **Weakness:** the demo Secret is committed in plain text (base64 is not encryption). Fix: Sealed Secrets / External Secrets / a cloud secret manager, plus etcd encryption. |
| Injection / bad input | Done: notes-api validates text (1–500 chars) and ObjectIds. The MongoDB driver uses structured queries and the id is regex-checked, so no query injection. The UI uses `textContent`, which prevents XSS. |
| Container hardening | Done: small `node:20-alpine` image, `npm ci` from lockfile, runs as `node` (non-root), resource limits (limits DoS impact). Possible: read-only root FS, image scanning (Trivy). |
| No authentication / plain HTTP | Not done (demo). Possible: Ingress with TLS (cert-manager), user login (OAuth2/OIDC), rate limiting. |
| Lateral movement inside cluster | Possible: NetworkPolicies (only web→notes-api, only notes-api→mongo), mTLS via a service mesh. |

## 4. Build, push, deploy

Prerequisites: Docker, a Kubernetes cluster (Docker Desktop K8s or minikube), kubectl, Docker Hub account.

```sh
# 1. build + push (replace <user>)
docker build -t <user>/notes-api:1.0 notes-api
docker build -t <user>/notes-web:1.0 web
docker login
docker push <user>/notes-api:1.0
docker push <user>/notes-web:1.0

# 2. set your username in the manifest (replaces YOUR_DOCKERHUB_USER), then deploy
kubectl apply -f k8s/app.yaml
kubectl get pods,svc,pvc
```

Open the app:
- Docker Desktop: http://localhost:30080
- minikube: `minikube service web --url`
- either: `kubectl port-forward svc/web 8080:80` → http://localhost:8080

**Demo commands (for the video)**
```sh
kubectl scale deployment notes-api --replicas=4     # scale independently
kubectl scale deployment web --replicas=3
kubectl logs -l app=notes-api --prefix -f           # log output
kubectl delete pod -l app=mongo                     # data survives restart (PVC)
curl http://localhost:30080/api/notes               # REST API directly
curl -X POST -H "Content-Type: application/json" -d '{"text":"hi"}' http://localhost:30080/api/notes
```
Refresh the page a few times to see the pod names in the footer change.
