(function () {
  "use strict";

  /* ---------- Pipeline simulation ---------- */
  var steps = [
    { id: "commit", lines: ["$ git push origin main", "→ 1 commit received: “Add health check endpoint”"], ms: 700 },
    { id: "build",  lines: ["$ docker build -t app:7f3a9c1 .", "→ Image built (84 MB), pushed to registry"], ms: 1100 },
    { id: "test",   lines: ["$ npm test", "→ 128 tests passed, coverage 91%"], ms: 1000 },
    { id: "scan",   lines: ["$ trivy image app:7f3a9c1", "→ 0 critical, 0 high vulnerabilities"], ms: 900 },
    { id: "deploy", lines: ["$ helm upgrade --install app ./chart", "→ Rollout complete, 3/3 pods healthy"], ms: 1100 }
  ];

  var runBtn = document.getElementById("run");
  var log = document.getElementById("log");
  var status = document.getElementById("status");
  var stageEls = document.querySelectorAll("#stages li");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, reduce ? 0 : ms); });
  }

  function reset() {
    stageEls.forEach(function (el) { el.className = ""; });
    log.textContent = "";
    status.className = "pipe-foot";
  }

  function setStage(id, state) {
    var el = document.querySelector('[data-stage="' + id + '"]');
    if (el) el.className = state;
  }

  async function runPipeline() {
    runBtn.disabled = true;
    reset();
    var started = Date.now();
    status.textContent = "Running…";

    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      setStage(s.id, "running");
      log.textContent += (log.textContent ? "\n" : "") + s.lines[0];
      log.scrollTop = log.scrollHeight;
      await wait(s.ms);
      log.textContent += "\n" + s.lines[1];
      log.scrollTop = log.scrollHeight;
      setStage(s.id, "done");
    }

    var secs = ((Date.now() - started) / 1000).toFixed(1);
    log.textContent += "\n\nRelease 7f3a9c1 is live.";
    status.textContent = "Last run: passed (simulated)";
    status.className = "pipe-foot ok";
    runBtn.textContent = "Run again";
    runBtn.disabled = false;
  }

  runBtn.addEventListener("click", runPipeline);

  /* ---------- Code tabs ---------- */
  var snippets = {
    actions:
"name: ci\n" +
"on:\n" +
"  push:\n" +
"    branches: [main]\n" +
"  pull_request:\n\n" +
"jobs:\n" +
"  test:\n" +
"    runs-on: ubuntu-latest\n" +
"    steps:\n" +
"      - uses: actions/checkout@v4\n" +
"      - uses: actions/setup-node@v4\n" +
"        with:\n" +
"          node-version: 20\n" +
"          cache: npm\n" +
"      - run: npm ci\n" +
"      - run: npm test\n\n" +
"  build-and-push:\n" +
"    needs: test\n" +
"    if: github.ref == 'refs/heads/main'\n" +
"    runs-on: ubuntu-latest\n" +
"    permissions:\n" +
"      packages: write\n" +
"    steps:\n" +
"      - uses: actions/checkout@v4\n" +
"      - uses: docker/login-action@v3\n" +
"        with:\n" +
"          registry: ghcr.io\n" +
"          username: ${{ github.actor }}\n" +
"          password: ${{ secrets.GITHUB_TOKEN }}\n" +
"      - uses: docker/build-push-action@v5\n" +
"        with:\n" +
"          push: true\n" +
"          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}",

    docker:
"# Build stage\n" +
"FROM node:20-alpine AS build\n" +
"WORKDIR /app\n" +
"COPY package*.json ./\n" +
"RUN npm ci\n" +
"COPY . .\n" +
"RUN npm run build\n\n" +
"# Runtime stage\n" +
"FROM node:20-alpine\n" +
"WORKDIR /app\n" +
"ENV NODE_ENV=production\n" +
"COPY --from=build /app/dist ./dist\n" +
"COPY --from=build /app/package*.json ./\n" +
"RUN npm ci --omit=dev && npm cache clean --force\n" +
"USER node\n" +
"EXPOSE 3000\n" +
"HEALTHCHECK CMD wget -qO- http://localhost:3000/health || exit 1\n" +
"CMD [\"node\", \"dist/server.js\"]",

    terraform:
"terraform {\n" +
"  backend \"s3\" {\n" +
"    bucket         = \"acme-tf-state\"\n" +
"    key            = \"prod/network.tfstate\"\n" +
"    region         = \"ap-south-1\"\n" +
"    dynamodb_table = \"tf-locks\"\n" +
"    encrypt        = true\n" +
"  }\n" +
"}\n\n" +
"module \"vpc\" {\n" +
"  source  = \"terraform-aws-modules/vpc/aws\"\n" +
"  version = \"~> 5.0\"\n\n" +
"  name            = \"prod\"\n" +
"  cidr            = \"10.0.0.0/16\"\n" +
"  azs             = [\"ap-south-1a\", \"ap-south-1b\"]\n" +
"  private_subnets = [\"10.0.1.0/24\", \"10.0.2.0/24\"]\n" +
"  public_subnets  = [\"10.0.101.0/24\", \"10.0.102.0/24\"]\n" +
"  enable_nat_gateway = true\n\n" +
"  tags = { Environment = \"prod\", ManagedBy = \"terraform\" }\n" +
"}",

    k8s:
"apiVersion: apps/v1\n" +
"kind: Deployment\n" +
"metadata:\n" +
"  name: app\n" +
"spec:\n" +
"  replicas: 3\n" +
"  strategy:\n" +
"    rollingUpdate:\n" +
"      maxUnavailable: 0\n" +
"      maxSurge: 1\n" +
"  selector:\n" +
"    matchLabels: { app: app }\n" +
"  template:\n" +
"    metadata:\n" +
"      labels: { app: app }\n" +
"    spec:\n" +
"      containers:\n" +
"        - name: app\n" +
"          image: ghcr.io/your-username/app:7f3a9c1\n" +
"          ports: [{ containerPort: 3000 }]\n" +
"          readinessProbe:\n" +
"            httpGet: { path: /health, port: 3000 }\n" +
"          resources:\n" +
"            requests: { cpu: 100m, memory: 128Mi }\n" +
"            limits: { cpu: 500m, memory: 256Mi }"
  };

  var tabs = document.querySelectorAll(".tabs [role=tab]");
  var block = document.getElementById("code-block");
  var copyBtn = document.getElementById("copy");
  var current = "actions";

  function show(name) {
    current = name;
    block.textContent = snippets[name];
    tabs.forEach(function (t) {
      t.setAttribute("aria-selected", String(t.dataset.tab === name));
    });
    copyBtn.textContent = "Copy";
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () { show(t.dataset.tab); });
  });

  copyBtn.addEventListener("click", function () {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(snippets[current]).then(function () {
      copyBtn.textContent = "Copied";
      setTimeout(function () { copyBtn.textContent = "Copy"; }, 1500);
    });
  });

  show(current);

  /* ---------- Footer year ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();
})();
