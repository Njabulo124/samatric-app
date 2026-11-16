<#
Build the static site and publish it to S3 + CloudFront.

Usage (from the repo root, in PowerShell):
    .\scripts\deploy.ps1              build, upload, refresh CloudFront
    .\scripts\deploy.ps1 -SkipBuild   upload the dist/ folder as it is

Before the first run, and whenever it says you are signed out:
    aws login --profile samatric

Nothing here is secret: the bucket and the site address are public names.
#>
param(
  [string]$Bucket = 'samatric-site-njabulo',
  [string]$Domain = 'd1jyytbz9yqcuv.cloudfront.net',
  [string]$AwsProfile = 'samatric',
  [switch]$SkipBuild
)

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$target = "s3://$Bucket"

function Stop-IfFailed($what) {
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $what" -ForegroundColor Red; exit 1 }
}

# 1. Signed in?
$account = aws sts get-caller-identity --profile $AwsProfile --query Account --output text
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not signed in. Run:  aws login --profile $AwsProfile" -ForegroundColor Yellow
  exit 1
}
Write-Host "Signed in to AWS account $account"

# 2. Build dist/ from the database
if (-not $SkipBuild) {
  Push-Location (Join-Path $root 'backend')
  npm run build:static
  $built = $LASTEXITCODE
  Pop-Location
  if ($built -ne 0) { Write-Host 'FAILED: build' -ForegroundColor Red; exit 1 }
}
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
  Write-Host 'dist/index.html not found. Run without -SkipBuild.' -ForegroundColor Red
  exit 1
}

# 3. Upload. File types are set by hand because Windows sometimes reports .js as text/plain,
#    which browsers refuse to run.
#    Data first: its name changes with its content, so it can be cached for a year, and the old
#    file stays in place until the new page is up.
aws s3 sync (Join-Path $dist 'data') "$target/data" --profile $AwsProfile --size-only `
  --exclude '*' --include '*.json' `
  --content-type 'application/json' --cache-control 'public, max-age=31536000, immutable'
Stop-IfFailed 'upload data'

$types = [ordered]@{
  '*.js'   = 'text/javascript; charset=utf-8'
  '*.css'  = 'text/css; charset=utf-8'
  '*.html' = 'text/html; charset=utf-8'
}
# The page files are always uploaded in full (they are tiny), so a deploy never depends on file dates.
foreach ($pattern in $types.Keys) {
  aws s3 cp $dist $target --recursive --profile $AwsProfile `
    --exclude '*' --include $pattern --exclude 'data/*' `
    --content-type $types[$pattern] --cache-control 'public, max-age=300'
  Stop-IfFailed "upload $pattern"
}

# Anything else (images, icons) with its normal type
aws s3 cp $dist $target --recursive --profile $AwsProfile `
  --exclude '*.js' --exclude '*.css' --exclude '*.html' --exclude 'data/*' `
  --cache-control 'public, max-age=300'
Stop-IfFailed 'upload other files'

# Remove files that are no longer in dist/ (e.g. the previous data file). --size-only stops this
# pass from re-uploading the files above with guessed types.
aws s3 sync $dist $target --profile $AwsProfile --delete --size-only
Stop-IfFailed 'clean up old files'

# 4. Tell CloudFront to fetch the new files
$distId = aws cloudfront list-distributions --profile $AwsProfile `
  --query "DistributionList.Items[?DomainName=='$Domain'].Id | [0]" --output text
Stop-IfFailed 'find the CloudFront distribution'
if (-not $distId -or $distId -eq 'None') {
  Write-Host "No CloudFront distribution found for $Domain" -ForegroundColor Red
  exit 1
}
$invalidation = aws cloudfront create-invalidation --profile $AwsProfile `
  --distribution-id $distId --paths '/*' --query 'Invalidation.Id' --output text
Stop-IfFailed 'refresh CloudFront'

Write-Host ''
Write-Host "Deployed. CloudFront refresh $invalidation started on $distId (takes a minute or two)."
Write-Host "Live at https://$Domain"
