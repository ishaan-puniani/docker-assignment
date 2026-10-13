# Running the project in GitHub Codespaces

Use this if you can't run Docker locally (for example, virtualization is disabled on your PC).
A Codespace is a cloud Linux VM that you use from the browser. The free tier (about 60 hours a month on a 2-core machine) is enough for this project.

The repo includes [.devcontainer/devcontainer.json](.devcontainer/devcontainer.json), so the Codespace starts with **Docker, kubectl and minikube** already installed.

## 1. Put the project on GitHub

Create a new **public** repo on github.com (e.g. `notes-k8s`). Upload the *contents* of the project folder so that `.devcontainer/` is at the top of the repo.

**Option A: Git (recommended)**, run from the project folder:
```powershell
git init; git add .; git commit -m "Notes microservice app"
git branch -M main
git remote add origin https://github.com/<you>/notes-k8s.git
git push -u origin main
```
`.gitignore` already leaves out `node_modules`.

**Option B: Browser upload.** On the repo page click "uploading an existing file" and drag the files in.
- Leave out both `node_modules` folders.
- The web uploader may skip files that start with a dot (`.devcontainer/devcontainer.json`, `.gitignore`, `.dockerignore`). If they're missing, recreate them with **Add file → Create new file**.

## 2. Create the Codespace

On the repo page: **Code → Codespaces → Create codespace on main**.
The first start takes about 3–5 minutes while the tools install. You get VS Code in the browser, with a terminal.

## 3. Start Kubernetes, build, push, deploy

Replace `<user>` with your Docker Hub username. The Docker Hub repos must be **public** so Kubernetes can pull the images.

```bash
minikube start                                   # 1-node Kubernetes cluster

docker login
docker build -t <user>/notes-api:1.0 notes-api
docker build -t <user>/notes-web:1.0 web
docker push <user>/notes-api:1.0
docker push <user>/notes-web:1.0

sed -i 's/YOUR_DOCKERHUB_USER/<user>/' k8s/app.yaml
kubectl apply -f k8s/app.yaml
kubectl get pods -w                              # wait for 5 pods Running 1/1, then Ctrl+C
```

## 4. Open the app

```bash
kubectl port-forward svc/web 8080:80
```
Codespaces shows an **Open in Browser** popup for port 8080. If you miss it, open the **Ports** tab next to the terminal and click the globe icon.

- Keep this command running while you use the app.
- `localhost:30080` does **not** work in a Codespace (that's Docker Desktop only).

## 5. Demo commands (for the video)

Open a second terminal (the **+** in the terminal panel) and leave port-forward running in the first.

```bash
kubectl get pods,svc,pvc                          # everything that's running
kubectl logs -l app=notes-api --prefix -f         # live logs; add notes in the browser
kubectl scale deployment notes-api --replicas=4   # scale one service independently
kubectl scale deployment web --replicas=3
kubectl delete pod -l app=mongo                   # DB restarts; notes survive (PVC)
curl http://localhost:8080/api/notes              # call the REST API directly
curl -X POST -H "Content-Type: application/json" -d '{"text":"hi"}' http://localhost:8080/api/notes
```
Refresh the browser a few times to see the pod names in the footer change.

> If you delete a `web` pod, port-forward may drop. Just run the port-forward command again.

## 6. Save your work and free hours

- Commit the edited `k8s/app.yaml` (**Source Control** tab → commit → **Sync**) so the submitted repo has your real image names.
- Stop the Codespace when you're done: github.com/codespaces → **⋯** → **Stop codespace**. Your files are kept.
- Next time, reopen the Codespace and run `minikube start`. Your deployment and its stored notes should still be there.

## Troubleshooting

| Problem | Fix |
|---|---|
| `ImagePullBackOff` | The image name in `k8s/app.yaml` doesn't match what you pushed, or the Docker Hub repo is private. |
| `notes-api` restarts a few times at first | Normal while mongo is starting. It settles after a minute. |
| `minikube start` fails with a resources error | Create the Codespace with a 4-core machine type (Code → Codespaces → ⋯ → New with options). |
| Port 8080 page doesn't load | Check `kubectl port-forward` is still running, then reopen from the Ports tab. |
| Start over | `kubectl delete -f k8s/app.yaml` (this also deletes stored notes), then apply again. |
