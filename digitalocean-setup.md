# Running the project on a DigitalOcean Droplet (k3s)

This deploys the app to one cloud VM (a "Droplet") running **k3s**, a lightweight but complete Kubernetes.
The app is then publicly reachable at `http://<droplet-ip>:30080`, from any browser.

You don't need Docker or virtualization on your own PC; everything runs on the Droplet.

## 1. Create the Droplet

On cloud.digitalocean.com: **Create → Droplets**
- **Image:** Ubuntu 24.04 LTS
- **Plan:** Basic, Regular, **2 GB RAM / 1 CPU** (~$12/month). 4 GB is roomier if builds feel slow.
- **Region:** any one close to you
- **Authentication:** SSH key (more secure) or password

Note the Droplet's **public IPv4 address** once it's created.

> Students: the GitHub Student Developer Pack includes DigitalOcean credit.

## 2. Open a terminal on the Droplet

Either:
- click **Console** on the Droplet page (works in the browser), or
- from PowerShell: `ssh root@<droplet-ip>`

## 3. Install Docker and k3s

```bash
curl -fsSL https://get.docker.com | sh     # Docker, for building and pushing images
curl -sfL https://get.k3s.io | sh -        # Kubernetes (k3s), includes kubectl
kubectl get nodes                          # should show 1 node, STATUS Ready
```

k3s comes with a default storage class (`local-path`), so the database's storage claim in `k8s/app.yaml` works without changes.

## 4. Build, push, deploy

Replace `<you>` with your GitHub username and `<user>` with your Docker Hub username. The Docker Hub repos must be **public**.

```bash
git clone https://github.com/<you>/notes-k8s.git && cd notes-k8s

docker login
docker build -t <user>/notes-api:1.0 notes-api
docker build -t <user>/notes-web:1.0 web
docker push <user>/notes-api:1.0
docker push <user>/notes-web:1.0

sed -i 's/YOUR_DOCKERHUB_USER/<user>/' k8s/app.yaml
kubectl apply -f k8s/app.yaml
kubectl get pods -w        # wait for 5 pods Running 1/1, then Ctrl+C
```

## 5. Open the app

Go to **http://&lt;droplet-ip&gt;:30080** in any browser.
No port-forward is needed, and the app keeps running after you close the terminal.

## 6. Add a firewall (do this)

In DigitalOcean go to **Networking → Firewalls → Create Firewall**:
- **Inbound rules:** SSH (TCP 22) and Custom (TCP 30080). Remove everything else.
- **Outbound rules:** leave the defaults.
- **Apply to Droplets:** select your Droplet.

This keeps the Kubernetes API (port 6443) and anything else off the public internet. Only the SSH port and the `web` service are reachable.

## 7. Demo commands (for the video)

```bash
kubectl get pods,svc,pvc                          # everything that's running
kubectl logs -l app=notes-api --prefix -f         # live logs; add notes in the browser
kubectl scale deployment notes-api --replicas=4   # scale one service independently
kubectl scale deployment web --replicas=3
kubectl delete pod -l app=mongo                   # DB restarts; notes survive (PVC)
curl http://localhost:30080/api/notes             # call the REST API directly
curl -X POST -H "Content-Type: application/json" -d '{"text":"hi"}' http://localhost:30080/api/notes
```
Refresh the browser a few times to see the pod names in the footer change.
You can also run `sudo reboot`, reconnect after a minute, and show the notes are still there.

## 8. Save your work and clean up

- Commit the edited `k8s/app.yaml` so the submitted repo has your real image names:
  ```bash
  git add k8s/app.yaml && git commit -m "Set Docker Hub image names" && git push
  ```
  GitHub asks for a personal access token as the password (github.com → Settings → Developer settings → Tokens).
  Or just make the same edit on github.com.
- **A Droplet bills even when it's powered off.** Once you've recorded the video and been graded, **destroy** it (Droplet → Destroy).
- The database lives on the Droplet's disk: it survives pod restarts and reboots, but is deleted when you destroy the Droplet.

## Troubleshooting

| Problem | Fix |
|---|---|
| `ImagePullBackOff` | The image name in `k8s/app.yaml` doesn't match what you pushed, or the Docker Hub repo is private. |
| `notes-api` restarts a few times at first | Normal while mongo is starting. It settles after a minute. |
| Browser can't reach `:30080` | Check the firewall allows TCP 30080 and that pods are `Running` (`kubectl get pods`). |
| Pods stuck `Pending`, or builds very slow | Out of memory. Resize the Droplet to 4 GB (Droplet → Resize). |
| Start over | `kubectl delete -f k8s/app.yaml` (this also deletes stored notes), then apply again. |
