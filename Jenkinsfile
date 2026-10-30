
pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 20, unit: 'MINUTES')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                echo 'SmartClass source checked out from GitHub.'
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Run Tests') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build Docker Image') {
            steps {
                sh 'docker build -t smartclass:latest .'
            }
        }

        stage('Load Image into Minikube') {
            steps {
                sh 'minikube image load smartclass:latest'
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sh 'kubectl apply -f public/k8s/deployment.yml'
                sh 'kubectl apply -f public/service.yml'
                sh 'kubectl rollout restart deployment/smartclass'
            }
        }

        stage('Verify Deployment') {
            steps {
                sh 'kubectl rollout status deployment/smartclass --timeout=120s'
                sh 'kubectl get pods'
                sh 'kubectl get deployments'
                sh 'kubectl get services'
            }
        }
    }

    post {
        success {
            echo 'SmartClass CI/CD pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed. Check the console output.'
        }
    }
}
