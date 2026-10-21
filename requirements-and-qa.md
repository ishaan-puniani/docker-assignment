# Requirements checklist and Q&A preparation

This file maps each assignment requirement to where it is met in this repository, and gives prepared answers for each question topic.

## 1. Requirement checklist

| Requirement | Met? | Where / evidence |
|---|---|---|
| Programmatically connect to and use a REST API | Yes | `web/server.js`, function `callApi()`: calls `notes-api` with Node.js `fetch` (`GET`/`POST /notes`, `DELETE /notes/{id}`), 3 s timeout, then uses the JSON result (e.g. `/api/stats` computes count and average length from it). |
| Program a microservice that provides a REST API | Yes | Two of them. `notes-api/server.js`: `GET`/`POST /notes`, `DELETE /notes/{id}`, `GET /health`. `web/server.js`: `GET`/`POST /api/notes`, `DELETE /api/notes/{id}`, `GET /api/stats`, `GET /health`. |
| No reuse of microservices not developed by me (except the database) | Yes | `web` and `notes-api` are written from scratch. The only third-party container is `mongo:7`. Express and the MongoDB driver are libraries, not microservices. |
| Any software idea | Yes | A shared notes board. |
| Acknowledge if too small to need scaling, and say what to pretend | Yes | See [section 3](#3-what-to-pretend-scale-assumption). |
| Any programming language | Yes | JavaScript on Node.js 20 with Express 5. |
| Access interface needs no extra tools on the examiner's computer | Yes | A normal web browser at `http://<host>:30080`. The REST API also works with `curl`, which Windows, macOS and Linux include. |
| Any type of database | Yes | MongoDB 7 (NoSQL document database). |
| May be deployed to a cloud provider | Optional | Can run on a DigitalOcean Droplet with k3s: see [digitalocean-setup.md](digitalocean-setup.md). |

## 2. Prepared answers

### Your software application idea
- **What it is:** a shared notes board. Users add short notes (1–500 characters), see all notes, and delete them.
- **What the page shows:** the note count, the average note length, and which `web` and `notes-api` pod served the request.
- **Why this idea:** it's simple enough that the focus stays on the architecture, but it still needs every required part:
  - a UI,
  - a REST service calling another REST service,
  - a database with persistent storage.

### The architecture design decisions
| Decision | Reason |
|---|---|
| Split into `web` (gateway + UI) and `notes-api` (data service) | Each part has one responsibility and is scaled, deployed and changed separately. |
| Only `web` is public (NodePort); `notes-api` and `mongo` are ClusterIP | API Gateway / Backend-for-Frontend pattern: one entry point and a smaller attack surface. |
| Only `notes-api` talks to MongoDB | Database-per-service: the data has one owner, and the schema can change without touching `web`. |
| Both services are stateless | Any replica can answer any request, so horizontal scaling is just `kubectl scale`. |
| REST/JSON over HTTP between services | Simple, language-neutral, and easy to test with a browser or `curl`. |
| 3 s timeout + `503` in `web` | Fail fast: a slow or dead `notes-api` must not hang users' requests. |
| MongoDB as one replica on a PersistentVolumeClaim, `Recreate` strategy | Data survives restarts. The database doesn't have to scale, and `Recreate` prevents two pods from writing the same volume. |
| Credentials in a Secret, URLs in environment variables | Configuration lives outside the code and images, so the same image runs in any environment. |
| Readiness probes on `/health` | Kubernetes only sends traffic to pods that are ready. |
| Everything in one `k8s/app.yaml` | Declarative and repeatable: one `kubectl apply` deploys the whole system. |

### The business implications
- **Cost efficiency:** you scale only the tier that is under load (e.g. more `web` pods for page traffic), instead of scaling a whole monolith.
- **Availability:** two replicas per service plus rolling updates mean no downtime when a pod crashes or a new version ships.
- **Faster delivery:** teams can release `web` and `notes-api` independently, as long as the REST contract holds.
- **Lower risk:** the database is not reachable from the internet, which reduces the chance and cost of a data breach.
- **No vendor lock-in:** standard Docker images and Kubernetes objects run on a laptop, k3s, or any cloud.
- **Trade-off:** more moving parts means more operational skill and tooling, such as monitoring and CI/CD, which costs time and money.

### Interaction between the microservices
1. The browser sends `POST /api/notes` to `web` through the NodePort Service on port 30080.
2. The `web` Service load-balances to one `web` pod.
3. That pod calls `POST http://notes-api:5000/notes`. Kubernetes DNS resolves `notes-api` to the Service, which load-balances to one `notes-api` pod.
4. `notes-api` validates the text, then inserts it into MongoDB at `mongo:27017`, authenticating with credentials from the Secret.
5. `notes-api` returns `201` with the new note and an `X-Served-By` header naming its pod.
6. `web` relays the response and adds its own pod name. The page then reloads the list and `GET /api/stats`.
7. If `notes-api` is down or takes more than 3 s, `web` returns `503 notes-api unavailable`.

### Details of the deployment
| | `web` | `notes-api` | `mongo` |
|---|---|---|---|
| Image | `<user>/notes-web:1.0` | `<user>/notes-api:1.0` | `mongo:7` |
| Replicas | 2 (scalable) | 2 (scalable) | 1 |
| Service | NodePort 80 → 5000, node port 30080 | ClusterIP 5000 | ClusterIP 27017 |
| Probe | readiness `GET /health` | readiness `GET /health` | none |
| Resources | 50m / 64Mi request, 250m / 128Mi limit | same | not set |
| Storage | none | none | PVC `mongo-pvc`, 1Gi, `/data/db` |

- **Images:** built from the Dockerfiles (`node:20-alpine`, `npm ci --omit=dev`, runs as non-root `node`) and pushed to Docker Hub.
- **Deploy:** `kubectl apply -f k8s/app.yaml`. See the [README](README.md), [codespace-setup.md](codespace-setup.md) or [digitalocean-setup.md](digitalocean-setup.md).
- **Demo commands:**
  - `kubectl get pods,svc,pvc`
  - `kubectl logs -l app=notes-api --prefix -f`
  - `kubectl scale deployment notes-api --replicas=4`
  - `kubectl delete pod -l app=mongo`: the notes survive the restart.

### Security issues identified and/or mitigated
| Issue | Mitigated | Still open → how to fix |
|---|---|---|
| Exposed attack surface | Only `web` is public; `notes-api` and `mongo` are ClusterIP; cloud firewall allows ports 22 and 30080 only | Ingress with a web application firewall |
| Database credentials | Mongo auth is on; credentials come from a Secret, not the code | The demo Secret is committed in plain text → Sealed Secrets / External Secrets, etcd encryption |
| Injection and XSS | Text length and id format are validated; structured MongoDB queries; UI uses `textContent` | Content-Security-Policy and security headers (`helmet`) |
| Error information leakage | A generic `internal error` goes to the client; details go only to the server log | Remove the `X-Served-By` headers outside demos |
| Denial of service | CPU and memory limits; Express caps JSON bodies at 100 KB | Rate limiting; autoscaling with an upper bound |
| Container hardening | Small alpine image, non-root user, lockfile installs | Image scanning (Trivy), read-only root filesystem, pinned `mongo` version |
| No authentication | Not done | OAuth2 / OpenID Connect login; per-user notes |
| No encryption in transit | Not done | TLS on the Ingress (cert-manager); mTLS via a service mesh |
| App uses the Mongo root account | Not done | A dedicated least-privilege MongoDB user for `notesdb` |
| Any pod can reach `notes-api` and `mongo` | Not done | NetworkPolicies: only `web` → `notes-api`, and only `notes-api` → `mongo` |

## 3. What to pretend (scale assumption)
This application is deliberately small; a notes board with a few users doesn't need to scale.

For the design to make sense, imagine a **company-wide notice board used by thousands of employees**, where reads far outnumber writes. In that scenario:
- **Heavy page traffic:** scale `web` (e.g. `kubectl scale deployment web --replicas=5`).
- **Heavy data traffic:** scale `notes-api` on its own.
- **The database:** stays a single instance here (allowed by the assignment). In production it would become a MongoDB replica set or a managed database.

Refresh the page a few times to see different pod names in the footer. This shows Kubernetes spreading requests across replicas.
